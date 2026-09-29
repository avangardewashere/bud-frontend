import { test, expect, type Page } from "@playwright/test";
import { BudApiError, BudApiUnreachableError, BudApiWakingError, budApi } from "@/lib/api";
import { PASSWORD_MIN_LENGTH, changeFailure, revokedMessage } from "@/lib/account/password";
import { connectionWarning } from "@/lib/course/connection";
import {
  GITHUB_SIGN_IN_PATH,
  PASSWORD_ONLY,
  demoMessage,
  signInError,
  signInOptions,
} from "@/lib/auth/sign-in";
import { LEARNER, signIn, skipWithoutApi } from "./support/api";

/**
 * Block 20 — what a deployment offers at the door, and the account screen behind it.
 *
 * Which sign-in options exist is configuration: this machine's API has GitHub and the
 * demo switched off, and a deployment may have either on. So the rules are stated as
 * pure functions and checked directly, and the screens are checked against **what the
 * API actually reports** rather than against an assumption — the same discipline the
 * catalog's cover test uses.
 *
 * **A known gap.** Nothing here proves the *behaviour* of the PASSWORD_ONLY fallback,
 * because the providers call is server-side: forcing it would need the shell started
 * against a dead BUD_API_ORIGIN, which is a second server, not a route mock. The
 * fallback's shape is asserted below; that it is reached is not.
 */

const password = (page: Page) => page.getByRole("button", { name: "Continue", exact: true });
const github = (page: Page) => page.getByRole("link", { name: /Continue with GitHub/ });
const demo = (page: Page) => page.getByRole("button", { name: /Look around the demo/ });

// ── The shell's own rules, which need no API ───────────────────────────────────
//
// Deliberately outside the describe below: these are pure functions, and a suite that
// skipped them because a server was down would be hiding the half of this block that
// can always be checked.

test("the sign-in rules, stated once", () => {
  const options = signInOptions({
    password: true,
    github: true,
    demo: true,
    signupMode: "open",
  });
  expect(options).toEqual({
    password: true,
    github: true,
    demo: true,
    signup: "open",
    known: true,
  });

  /**
   * The fallback, for an API that could not be asked. It keeps the password form —
   * every deployment has one — and claims nothing else: saying "signup is invite-only"
   * would be stating a fact about the deployment that the failed request did not
   * teach us, and `known: false` is what lets the screen say so.
   */
  expect(PASSWORD_ONLY).toEqual({
    password: true,
    github: false,
    demo: false,
    signup: "unknown",
    known: false,
  });
});

test("an error code from the API becomes a sentence, and anything else stays vague", () => {
  // The codes the API really sends (backend github-oauth.controller.ts).
  for (const code of [
    "github_declined",
    "github_state_mismatch",
    "github_no_code",
    "github_failed",
    "signup_closed",
  ]) {
    const message = signInError(code);
    expect(message, code).toBeTruthy();
    expect(message, `${code} should read as a sentence`).toMatch(/[.!?]$/);
    expect(message, "and never show the raw code").not.toContain(code);
  }

  expect(signInError(null)).toBeNull();
  expect(signInError(undefined)).toBeNull();
  expect(signInError("")).toBeNull();

  const vague = "That sign-in didn't complete. Try once more.";
  /**
   * The code arrives in a URL, so it is a stranger's text. Anything unrecognised gets
   * the plain fallback rather than being echoed onto the screen in Bud's voice.
   */
  expect(signInError("<script>alert(1)</script>")).toBe(vague);
  expect(signInError("made_up_code")).toBe(vague);

  /**
   * And a key that is on every object rather than on this one. A plain `table[code]`
   * answers these with functions and objects off Object.prototype, which React then
   * refuses to render — so `?error=constructor` in a shared link would take the sign-in
   * page away from whoever opened it. Each of these must be a string or nothing.
   */
  for (const key of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
    expect(signInError(key), key).toBe(vague);
  }

  // A query string can repeat a key, and Next hands the page an array when it does.
  expect(signInError(["github_declined", "github_failed"])).toBeNull();
  expect(signInError(42)).toBeNull();
});

test("the door's failures are sentences too, including the demo's own two", () => {
  const api = (status: number, message: string) => new BudApiError(status, null, message);

  // The demo's two: a full pool, and a deployment that never had one.
  expect(demoMessage(api(503, "no"))).toContain("every place is taken");
  expect(demoMessage(api(404, "no"))).toContain("isn't running on this deployment");
  // Anything else falls through to the shared sign-in wording.
  expect(demoMessage(api(401, "no"))).toBe("That email and password don't match.");
  expect(demoMessage(api(429, "no"))).toContain("Too many attempts");
  expect(demoMessage(new Error("boom"))).toBe("Couldn't sign in. Trying again may help.");
});

test("the change-password outcomes say what is true and no more", () => {
  expect(revokedMessage(0)).toBe("Password changed.");
  expect(revokedMessage(1)).toBe("Password changed, and one other session was signed out.");
  expect(revokedMessage(3)).toBe("Password changed, and 3 other sessions were signed out.");
  // A count the API should never send should still not produce "-1 other sessions".
  expect(revokedMessage(-1)).toBe("Password changed.");

  /**
   * The one message that could lock someone out of their own account. A gateway error
   * means something in front of the API gave up waiting — not that the API never ran
   * the change. "Nothing changed" there would have them trying the old password
   * forever while the new one is the live one.
   */
  const waking = changeFailure(new BudApiWakingError("http://api.test/auth/change-password"));
  expect(waking.message).not.toContain("Nothing changed");
  expect(waking.message).toContain("may or may not");

  // Nor may a connection that never landed claim an outcome it cannot know.
  const unreachable = changeFailure(new BudApiUnreachableError("http://api.test"));
  expect(unreachable.message).not.toContain("Nothing changed");
  expect(unreachable.message).toContain("Try again");

  // An answer *from* the API may say it, and belongs beside the field it is about.
  const wrong = changeFailure(new BudApiError(401, null, "Unauthorized"));
  expect(wrong.field).toBe("current");
  expect(wrong.message).toContain("Nothing changed");

  const tooShort = changeFailure(
    new BudApiError(400, { errors: [{ path: "newPassword", message: "too short", code: "x" }] }, "Bad Request"),
  );
  expect(tooShort.field).toBe("next");
  expect(tooShort.message).toBe("too short");
});

test("the GitHub path is named once, so a typo cannot pass by matching itself", () => {
  /**
   * The only href that keeps the session first-party: the round trip has to go through
   * the shell's own /api rewrite, or the API's Set-Cookie lands on a host the shell
   * never reads cookies from. `/auth/github` would 404 on the shell; the API's own
   * origin would sign someone in somewhere else.
   */
  expect(GITHUB_SIGN_IN_PATH).toBe("/api/auth/github");
});

// ── The screens, against whatever this API reports ─────────────────────────────

test.describe("against the API", () => {
  test.beforeEach(async ({ page }) => {
    await skipWithoutApi(page);
  });

  test("the sign-in screen shows what this deployment actually offers", async ({ page }) => {
    const providers = await budApi.providers();
    await page.goto("/login");

    // The password form is always there, and it is a real heading's page.
    await expect(password(page)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in to Bud");

    /**
     * Before hydration this form is plain HTML, and a form with neither method nor
     * action submits as a GET to its own URL — putting a typed password in the address
     * bar, the history and every log in front of the shell. That is likeliest on the
     * cold deploy this app is built for, so it is asserted on the markup rather than
     * on a race nobody can reproduce on demand.
     */
    await expect(page.locator("form").first()).toHaveAttribute("method", /post/i);

    // The other two are configuration, so the screen is checked against the API's
    // answer rather than against what this machine happens to have switched on.
    if (providers.github) {
      await expect(github(page)).toHaveAttribute("href", GITHUB_SIGN_IN_PATH);
    } else {
      await expect(github(page), "no button for a route that would 404").toBeHidden();
    }

    if (providers.demo) await expect(demo(page)).toBeVisible();
    else await expect(demo(page)).toBeHidden();

    // The "or" divider belongs to those buttons and goes with them.
    const divider = page.getByText("or", { exact: true });
    if (providers.github || providers.demo) await expect(divider).toBeVisible();
    else await expect(divider).toBeHidden();

    if (providers.signupMode === "invite_only") {
      await expect(page.getByText("Signup is invite-only for now.")).toBeVisible();
    }
    // The API answered, so the card must not also claim it couldn't be asked.
    await expect(page.getByText(/Couldn’t check the other ways in/)).toBeHidden();
  });

  test("the GitHub path really reaches the API, whether or not GitHub is on", async ({ page }) => {
    /**
     * The href alone proves nothing: it is a string this suite could match against
     * itself. What matters is that the shell *forwards* that path, which is checkable
     * with OAuth switched off — the API answers its own JSON envelope, where the shell
     * would answer an HTML 404 for a route it doesn't have.
     */
    const providers = await budApi.providers();
    const answer = await page.request.get(GITHUB_SIGN_IN_PATH, { maxRedirects: 0 });

    if (providers.github) {
      // Configured: the API sends the browser to GitHub itself.
      expect(answer.status(), "should be a redirect to GitHub").toBe(302);
      expect(answer.headers()["location"]).toContain("github.com");
    } else {
      expect(answer.headers()["content-type"], "the API's envelope, not Next's 404 page")
        .toContain("json");
      expect(await answer.json()).toMatchObject({ statusCode: expect.any(Number) });
    }
  });

  test("a sign-in that failed elsewhere says so on the way back", async ({ page }) => {
    await page.goto("/login?error=github_declined");
    const signInAlert = page.getByRole("alert").filter({ hasText: /./ });
    await expect(signInAlert).toContainText("cancelled");

    /**
     * And it is focused. A message that is in the first paint changes no live region,
     * so nothing announces it; focusing both says it and puts the reader on it.
     */
    await expect(signInAlert).toBeFocused();

    // A code nobody recognises does not get to write its own message.
    await page.goto("/login?error=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E");
    const unknown = page.getByRole("alert").filter({ hasText: /./ });
    await expect(unknown).toContainText("didn't complete");
    await expect(unknown).not.toContainText("onerror");
    await expect(password(page), "and the form still works").toBeVisible();
  });

  test("a crafted ?error= cannot take the sign-in page away", async ({ page }) => {
    /**
     * These are the keys every object has. A link carrying one used to hand React a
     * function or Object.prototype where a string was promised, which threw during
     * render — so the error boundary took over and the visitor got a "waking up"
     * screen with no way in at all, on a page a stranger had sent them.
     */
    for (const key of ["constructor", "toString", "__proto__"]) {
      await page.goto(`/login?error=${encodeURIComponent(key)}`);
      await expect(password(page), `?error=${key} should still show the form`).toBeVisible();
      await expect(page.getByRole("alert").filter({ hasText: /./ })).toContainText(
        "didn't complete",
      );
    }
  });

  test.describe("the account screen", () => {
    test.beforeEach(async ({ page }) => {
      await signIn(page, LEARNER);
    });

    test("is reached from the initials, and says who you are", async ({ page }) => {
      await page.getByRole("link", { name: /^Account/ }).click();
      await expect(page).toHaveURL(/\/account$/);

      await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
      await expect(page.getByText(LEARNER.email)).toBeVisible();

      // Everything it offers is here, rather than scattered across the app.
      const account = page.getByRole("main");
      await expect(account.getByTestId("change-password")).toBeVisible();
      await expect(account.getByRole("radio", { name: /Match this device/ })).toBeVisible();
      await expect(account.getByRole("radio", { name: /^Dark/ })).toBeVisible();
      await expect(account.getByRole("link", { name: "Download everything" })).toBeVisible();
      // The nav has one too; this is the page's own.
      await expect(account.getByRole("button", { name: "Sign out" })).toBeVisible();

      // The rule, before it is broken rather than after.
      await expect(account.getByText(`At least ${PASSWORD_MIN_LENGTH} characters.`)).toBeVisible();
    });

    test("the theme preference is the same setting as the toggle in the bar", async ({ page }) => {
      await page.goto("/account");

      await page.getByRole("radio", { name: /^Dark/ }).check();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      // The bar's toggle is the same store, so it moves with it — no reload.
      await expect(
        page.getByTestId("theme-toggle").getByRole("button", { name: "Dark" }),
      ).toHaveAttribute("aria-pressed", "true");

      await page.getByRole("radio", { name: /Match this device/ }).check();
      await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
    });

    test("the export is a link the browser downloads, carrying the session", async ({ page }) => {
      await page.goto("/account");

      const link = page.getByRole("link", { name: "Download everything" });
      await expect(link).toHaveAttribute("href", "/api/me/export");
      /**
       * In its own tab. Anything that isn't a 200 is a response the browser renders,
       * and in this tab that would replace the account screen with the API's raw JSON.
       */
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", /noopener/);

      /**
       * Same-origin through the rewrite, so the cookie goes with it — the mistake the
       * notes export made in block 15, where the URL was right and the request was
       * anonymous. Asked for here rather than assumed.
       */
      const file = await page.request.get("http://localhost:3100/api/me/export");
      expect(file.ok(), `the export should build (${file.status()})`).toBe(true);
      expect(file.headers()["content-disposition"]).toContain("attachment");
      expect(file.headers()["content-type"]).toContain("zip");
      // A zip starts "PK"; anything else means an error page wearing a zip's name.
      expect((await file.body()).subarray(0, 2).toString()).toBe("PK");
    });

    test("a wrong current password is said plainly, beside the field it is about", async ({
      page,
    }) => {
      await page.goto("/account");

      const current = page.getByLabel("Current password");
      await current.fill("not-the-password");
      await page.getByLabel("New password").fill("a-new-password-123");
      await page.getByRole("button", { name: "Change password" }).click();

      // Scoped to the form: Next's route announcer is an alert too, and an empty one.
      const form = page.getByTestId("change-password");
      await expect(form.getByRole("alert")).toContainText(/isn't right|current password/i);

      // And the field carries it, rather than leaving a screen reader to find it.
      await expect(current).toHaveAttribute("aria-invalid", "true");
      const describedBy = await current.getAttribute("aria-describedby");
      expect(describedBy, "the message's id belongs to the input").toBeTruthy();
      await expect(page.locator(`#${describedBy?.split(" ")[0]}`)).toContainText(/isn't right/i);

      // Still signed in, and still able to do everything else.
      await page.goto("/dashboard");
      await expect(page.getByTestId("greeting")).toBeVisible();
    });
  });
});

test("a course that cannot reach the shell says what it costs, and names the addresses", () => {
  // Same address: nothing to diagnose, so it stays a learner's sentence.
  const plain = connectionWarning({
    pageOrigin: "https://bud.example",
    builtFor: "https://bud.example",
  });
  expect(plain).toContain("nothing you do in it will be saved");
  expect(plain).not.toContain("built for");

  /**
   * Different address: this is the deploy mistake the audit found — the app opened on
   * a hostname other than the one the course pages were published for. The shell knows
   * both, so it says both rather than leaving it to the browser console.
   */
  const mismatched = connectionWarning({
    pageOrigin: "https://bud-frontend-abc123-scope.vercel.app",
    builtFor: "https://bud-frontend.vercel.app",
  });
  expect(mismatched).toContain("nothing you do in it will be saved");
  expect(mismatched).toContain("https://bud-frontend.vercel.app");
  expect(mismatched).toContain("https://bud-frontend-abc123-scope.vercel.app");
});

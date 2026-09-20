import { test, expect, type Page } from "@playwright/test";

/**
 * M1 go/no-go: an unmodified Docker worksheet, in a sandboxed cross-origin frame,
 * persists its state through the bridge.
 *
 * Google Fonts is aborted in every test. The worksheets load a render-blocking
 * Google Fonts stylesheet, and when that request hangs (rather than fails) the
 * worksheet's own script — the one that calls window.storage.get — never runs.
 * Aborting makes the run deterministic and doubles as the "fonts unreachable"
 * case: a failed stylesheet must not stop the course working.
 */

async function blockExternalFonts(page: Page) {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
}

const traffic = (page: Page) => page.getByRole("list").last();
const keysHeld = (page: Page) => page.locator("section").first();
const course = (page: Page) => page.frameLocator('iframe[title="Docker session 1"]');

test.beforeEach(async ({ page }) => {
  await blockExternalFonts(page);
  await page.goto("/spike");
});

test("worksheet asks the shell for its state on load", async ({ page }) => {
  await expect(traffic(page)).toContainText('storage.get("docker-course:state")');
});

test("frame is isolated: opaque origin, no cookie access", async ({ page }) => {
  await expect(traffic(page)).toContainText("storage.get");

  const frame = page.frames().find((f) => f.url().includes("127.0.0.1:3101"));
  expect(frame, "course frame should be mounted").toBeTruthy();

  // Sandboxed without allow-same-origin => opaque origin, serialised as "null".
  expect(await frame!.evaluate(() => self.origin)).toBe("null");

  // And therefore no access to cookies — the whole reason for the sandbox.
  const cookie = await frame!.evaluate(() => {
    try {
      void document.cookie;
      return "readable";
    } catch {
      return "blocked";
    }
  });
  expect(cookie).toBe("blocked");

  // The bridge was injected and exposes exactly the corrected contract.
  const api = await frame!.evaluate(() => ({
    storage: Object.keys((window as unknown as { storage: object }).storage).sort(),
    bud: Object.keys((window as unknown as { bud: object }).bud).sort(),
  }));
  expect(api.storage).toEqual(["delete", "get", "set"]);
  expect(api.bud).toEqual(["complete", "height", "progress", "ready"]);
});

test("ticks and notes survive a reload of the course", async ({ page }) => {
  await expect(traffic(page)).toContainText("storage.get");

  const saves = () =>
    traffic(page).getByRole("listitem").filter({ hasText: "storage.set" }).count();

  await course(page).locator("#t1").check({ force: true });
  await expect.poll(saves).toBeGreaterThan(0);
  await expect(keysHeld(page)).toContainText("docker-course:state");

  /**
   * The worksheet debounces its own saves by 400ms, and the tick has already caused
   * one. Waiting for a *further* save is what proves the note reached the shell —
   * reloading on "some save happened" races the note's debounce and loses it.
   */
  const afterTick = await saves();
  await course(page).locator('textarea[data-note="t1"]').fill("Worked on my machine.");
  await expect.poll(saves).toBeGreaterThan(afterTick);

  // Reload only the frame: the spike's store lives in the parent, in memory.
  await page.evaluate(() => {
    const frame = document.querySelector("iframe")!;
    frame.src = frame.src;
  });

  await expect(course(page).locator("#t1")).toBeChecked();
  await expect(course(page).locator('textarea[data-note="t1"]')).toHaveValue(
    "Worked on my machine.",
  );
});

test("reset progress calls storage.delete, which the original spec omitted", async ({ page }) => {
  await expect(traffic(page)).toContainText("storage.get");

  await course(page).locator("#t1").check({ force: true });
  await expect(keysHeld(page)).toContainText("docker-course:state");

  // The worksheet confirm()s before clearing — which only works because the
  // frame is granted allow-modals. Without it, confirm() returns false.
  page.on("dialog", (dialog) => dialog.accept());
  await course(page).getByRole("button", { name: "Clear saved work" }).click();

  await expect(traffic(page)).toContainText('storage.delete("docker-course:state")');
});

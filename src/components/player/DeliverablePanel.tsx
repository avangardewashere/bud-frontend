"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { LocalDay } from "@/components/ui/LocalDay";
import {
  BudApiError,
  BudApiUnreachableError,
  BudApiWakingError,
  budApi,
  type Deliverable,
} from "@/lib/api";
import { linkLabel, safeHref } from "@/lib/safe-href";
import { tabMemory } from "./tabMemory";

/**
 * Handing in what a session asked for — Overall Plan §5.7, mockup 1g's caption row.
 *
 * A deliverable is a link: a repo, a gist, a screenshot, a live page. Bud does not
 * grade it and does not host it — "submitted" is the learner's own claim, and
 * retracting one keeps the link so it can be handed in again after another pass.
 *
 * Unlike the notes beside it, this does not autosave. A note is prose that grows as
 * you work; a link is something you paste once and mean. Autosaving half a URL as you
 * type it would announce work that isn't finished — and the dashboard's "waiting to
 * hand in" list reads those claims.
 *
 * Nothing typed here is lost by a failure: every error leaves the fields exactly as
 * they were, because the one thing this screen must never do is swallow the address
 * of the thing someone just spent an evening building.
 */

/** The API's own ceiling (`comment: z.string().max(1000)`), checked here so the message is ours. */
const COMMENT_MAX = 1000;

/**
 * What this tab knows about each session's hand-in, outliving the panel itself.
 *
 * The panel is mounted only while it is open, so without this, closing it — Escape,
 * the ×, the toggle — throws away a link that has been pasted but not handed in, and
 * reopening seeds from the page's copy, which after a write is behind by however long
 * a refresh takes. Both are the same mistake the notes panel had to stop making: the
 * page is not the newest thing in the room, this tab is.
 *
 * `at` is when this tab learned it, so a genuinely newer page wins — and a removal is
 * remembered as `saved: null`, which is different from "never looked".
 */
type Remembered = { saved: Deliverable | null; url: string; comment: string; at: number };
const lastKnown = tabMemory<Remembered>();
const rememberKey = (slug: string, sessionKey: string) => `${slug}/${sessionKey}`;

/** What to open with: this tab's memory, unless the page was rendered after it. */
function seed(lane: string, initial: Deliverable | null): Remembered {
  const known = lastKnown.get(lane);
  const pageAt = Date.parse(initial?.updatedAt ?? "") || 0;
  if (known && known.at > pageAt) return known;
  return {
    saved: initial,
    url: initial?.url ?? "",
    comment: initial?.comment ?? "",
    at: pageAt,
  };
}

export function DeliverablePanel({
  slug,
  session,
  initial,
  unknown = false,
  autoFocus = false,
  onChanged,
  onClose,
}: {
  slug: string;
  /** The session, with the manifest's ask — the caller renders this only when it has one. */
  session: { key: string; order: number; deliverable: string | null };
  /** What the page read from the API, or null when nothing has been handed in. */
  initial: Deliverable | null;
  /**
   * The page could not read this course's deliverables at all — a cold API, a timeout,
   * a rate limit. Then `initial` being null means "unknown", not "nothing", and the
   * panel has to say so rather than present an empty box as the truth: handing in
   * again would replace a link this screen never saw.
   */
  unknown?: boolean;
  /**
   * Put the cursor in the link field on open. True when a learner pressed the button
   * — the panel sits before that button in the document, so without this their next
   * Tab walks past it into the course frame. False when the panel opened by itself
   * after a session was marked complete: that is a suggestion, and taking someone's
   * cursor for a suggestion they did not ask for is rude.
   */
  autoFocus?: boolean;
  /** Something changed on the server: this is now the truth, and the page is stale. */
  onChanged?: (next: Deliverable | null) => void;
  onClose?: () => void;
}) {
  const lane = rememberKey(slug, session.key);
  /**
   * What the panel opens with: whatever this tab last knew, unless the page brought
   * something newer. The page's copy was read when the page was rendered, which after
   * a write of our own — or after a close and reopen — is behind.
   */
  const opening = useState(() => seed(lane, initial))[0];
  /** Opened with no idea what is stored: the page's read failed and this tab never saw one. */
  const [blind] = useState(() => unknown && !lastKnown.has(lane));

  const [saved, setSaved] = useState<Deliverable | null>(opening.saved);
  const [url, setUrl] = useState(opening.url);
  const [comment, setComment] = useState(opening.comment);
  const [busy, setBusy] = useState<null | "save" | "remove">(null);
  const [errors, setErrors] = useState<FormErrors>({});
  /** Removing throws away a link Bud cannot get back, so it asks first. */
  const [confirmRemove, setConfirmRemove] = useState(false);

  const ids = useId();
  const urlField = `${ids}-url`;
  const commentField = `${ids}-comment`;
  const urlRef = useRef<HTMLInputElement>(null);
  const commentRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  /** Where focus should land when the control that had it is about to vanish. */
  const nextFocus = useRef<null | "url" | "submit">(null);

  const dirty = url !== (saved?.url ?? "") || comment !== (saved?.comment ?? "");

  /*
   * After the opening render, `initial` is left alone. The page re-renders for reasons
   * that have nothing to do with this form — marking a session complete refreshes it —
   * and a form that rewrites itself from under a half-typed URL is worse than one
   * showing a value a few seconds old. What the panel learns, it puts in `lastKnown`
   * instead, where the next open will find it.
   */

  /** Everything on screen, kept where a close cannot take it. */
  useEffect(() => {
    lastKnown.set(lane, { saved, url, comment, at: Date.now() });
  }, [lane, saved, url, comment]);

  useEffect(() => {
    if (autoFocus) urlRef.current?.focus();
    // On open only: re-focusing on every render would fight whoever is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Focus, after a write settles.
   *
   * A button that is disabled while its request is in flight is blurred by the browser
   * the moment it is disabled, and Retract and Remove then vanish altogether with the
   * thing they undid. Either way focus lands on <body>, where the next Tab starts from
   * the top of the document — which on this screen means walking back in through the
   * header and the sandboxed course. This puts it on what the person needs next, and
   * only when nothing else has claimed it.
   */
  useEffect(() => {
    if (busy !== null || !nextFocus.current) return;
    const target = nextFocus.current === "url" ? urlRef.current : submitRef.current;
    nextFocus.current = null;
    if (document.activeElement === document.body) target?.focus();
  }, [busy]);

  /**
   * Keep the waking notice off this panel.
   *
   * The notice is fixed to the bottom of the screen and knows nothing about what is
   * down there; the player's own offset was set when the only furniture was Mark
   * complete and the session sheet. On a phone it landed squarely across the link
   * field — at the one moment that matters most, since the notice appears when the
   * API is asleep, which is when this panel is saying the link is safe. Measured
   * rather than guessed, because the panel's height depends on what is in it.
   */
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const root = document.documentElement;
    const clearance = window.innerHeight - el.getBoundingClientRect().top + 8;
    root.style.setProperty("--waking-offset", `${Math.round(clearance)}px`);
    return () => {
      root.style.removeProperty("--waking-offset");
    };
  });

  /**
   * Typed and not handed in: for that stretch the link exists only in this box, and
   * nothing else in the app knows about it. (The notes panel warns for the same
   * reason; the player warns while course state is unsaved.)
   */
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function run(action: "save" | "remove", work: () => Promise<Deliverable | null>) {
    // What the boxes held when the request left. A learner can keep typing while it is
    // in flight, and the answer coming back is about what was sent, not about what they
    // have since written — so it is only allowed to refill a box nobody has touched.
    const sentUrl = url;
    const sentComment = comment;
    setBusy(action);
    setErrors({});
    try {
      const next = await work();
      setSaved(next);
      setUrl((current) => (current === sentUrl ? next?.url ?? "" : current));
      setComment((current) => (current === sentComment ? next?.comment ?? "" : current));
      setConfirmRemove(false);
      onChanged?.(next);
    } catch (error) {
      const described = describe(error, action);
      setErrors(described);
      // Say it next to the field it is about, and put the cursor there.
      if (described.url) urlRef.current?.focus();
      else if (described.comment) commentRef.current?.focus();
    } finally {
      setBusy(null);
    }
  }

  /** Hand in, update, or retract — all one write, because they differ only in `submitted`. */
  function send(submitted: boolean) {
    const link = url.trim();
    if (link === "") {
      setErrors({ url: "Paste the link to what you made." });
      urlRef.current?.focus();
      return;
    }
    /**
     * The same check the shell uses before rendering any of these as a link, so a
     * learner is told now rather than after a round trip (the API refuses it too) —
     * and what goes up is the checked form, not the typed one. A URL with a space in
     * it parses here and is refused there, which would put "a deliverable must be an
     * http or https link" beside a box that plainly starts with https://.
     */
    const safe = safeHref(link);
    if (!safe) {
      setErrors({ url: "A link has to start with http:// or https://." });
      urlRef.current?.focus();
      return;
    }
    if (comment.length > COMMENT_MAX) {
      setErrors({ comment: `That note is too long — ${COMMENT_MAX} characters at most.` });
      commentRef.current?.focus();
      return;
    }
    // Pressing a button that is about to be disabled costs it the focus.
    nextFocus.current = "submit";
    void run("save", () =>
      // The comment is sent whether or not it has anything in it: leaving it out means
      // "don't change it", which would make clearing the box impossible.
      budApi.saveDeliverable(slug, session.key, { url: safe, comment: comment.trim(), submitted }),
    );
  }

  const handedIn = saved?.submittedAt != null;
  const href = safeHref(saved?.url);

  return (
    <section
      ref={panelRef}
      id="hand-in-panel"
      aria-label="Hand in"
      /*
        Never taller than the room it has: on a phone with the session sheet open there
        is not much of it, and a panel that refuses to shrink takes the space out of the
        course instead. It scrolls inside itself rather than pushing anything off.
      */
      className="max-h-[min(45dvh,100%)] min-h-0 shrink overflow-auto rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-3 [overflow-wrap:anywhere]"
      onKeyDown={(event) => {
        if (event.key === "Escape" && onClose) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Hand in</h2>
          {session.deliverable && (
            <p data-testid="hand-in-ask" className="mt-0.5 text-xs text-[var(--muted-foreground)]">
              {session.deliverable}
            </p>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close hand in"
            className="shrink-0 rounded px-2 text-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            ×
          </button>
        )}
      </div>

      {blind && saved === null && (
        <p role="status" className="mt-2 text-xs text-[var(--danger)]">
          Bud couldn&apos;t read what you&apos;ve handed in for this session. Reload before
          replacing anything.
        </p>
      )}

      {saved && (
        <p
          data-testid="hand-in-status"
          /*
            Spoken, not only shown: handing in, retracting and removing all change this
            line and nothing else, and a screen reader that is told only about failures
            leaves a learner unsure whether the thing they pressed did anything.
          */
          role="status"
          className="mt-2 text-xs"
        >
          <span className={handedIn ? "text-[var(--tint-foreground)]" : "text-[var(--muted-foreground)]"}>
            {handedIn ? (
              <>
                Handed in · <LocalDay iso={saved.submittedAt} />
              </>
            ) : (
              "Kept, not handed in"
            )}
          </span>{" "}
          {href ? (
            <a
              href={href}
              target="_blank"
              // noreferrer covers noopener everywhere Bud runs, and this is a link a
              // learner typed: the page it opens gets no handle on this tab.
              rel="noreferrer"
              className="text-[var(--tint-foreground)] hover:underline"
            >
              {linkLabel(saved.url)}
            </a>
          ) : (
            // Not a link Bud is willing to open. Shown, so they can see what is stored.
            <span className="text-[var(--muted-foreground)]">{saved.url}</span>
          )}
        </p>
      )}

      <form
        className="mt-2 flex flex-col gap-2"
        /*
          The browser's own URL check would refuse "github.com/me/thing" with a bubble
          that says "Please enter a URL" and no way to act on it. Bud says what it
          wants instead, in the panel, next to the field — and the check below is the
          same one the shell uses before it will render any of these as a link.
        */
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          send(true);
        }}
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="min-w-0 flex-1">
            <label htmlFor={urlField} className="sr-only">
              Link to your work for session {session.order}
            </label>
            <input
              ref={urlRef}
              id={urlField}
              name="url"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://github.com/you/what-you-made"
              aria-invalid={errors.url ? true : undefined}
              aria-describedby={errors.url ? `${urlField}-error` : undefined}
              className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-3 py-2 font-mono text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ring)]"
            />
          </div>
          <div className="min-w-0 flex-1">
            <label htmlFor={commentField} className="sr-only">
              A note about what you handed in (optional)
            </label>
            <input
              ref={commentRef}
              id={commentField}
              name="comment"
              type="text"
              maxLength={COMMENT_MAX}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Anything you want to say about it (optional)"
              aria-invalid={errors.comment ? true : undefined}
              aria-describedby={errors.comment ? `${commentField}-error` : undefined}
              className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ring)]"
            />
          </div>
        </div>

        {errors.url && (
          <p id={`${urlField}-error`} role="alert" className="text-xs text-[var(--danger)]">
            {errors.url}
          </p>
        )}
        {errors.comment && (
          <p id={`${commentField}-error`} role="alert" className="text-xs text-[var(--danger)]">
            {errors.comment}
          </p>
        )}
        {errors.form && (
          <p role="alert" className="text-xs text-[var(--danger)]">
            {errors.form}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {/*
            "Update" only once it is actually in: a button that says "Hand it in" over
            something already handed in reads as though it had not been.
          */}
          <Button ref={submitRef} type="submit" disabled={busy !== null} className="text-sm">
            {busy === "save" ? "Saving…" : handedIn ? "Update" : "Hand it in"}
          </Button>

          {handedIn && (
            <Button
              variant="secondary"
              onClick={() => send(false)}
              disabled={busy !== null}
              className="text-sm"
            >
              Retract
            </Button>
          )}

          {saved && (
            <>
              {/*
                One button, two presses — not a swap. A confirmation that replaces the
                button you just pressed drops the keyboard's focus on the floor, and
                the second press lands on whatever moved into that spot.
              */}
              <Button
                variant="ghost"
                onClick={() => {
                  if (!confirmRemove) {
                    setConfirmRemove(true);
                    return;
                  }
                  nextFocus.current = "url";
                  void run("remove", async () => {
                    await budApi.deleteDeliverable(slug, session.key);
                    return null;
                  });
                }}
                disabled={busy !== null}
                className={"text-sm" + (confirmRemove ? " text-[var(--danger)]" : "")}
              >
                {busy === "remove" ? "Removing…" : confirmRemove ? "Remove it?" : "Remove"}
              </Button>

              {confirmRemove && !busy && (
                <button
                  type="button"
                  onClick={() => setConfirmRemove(false)}
                  className="text-sm text-[var(--muted-foreground)] hover:underline"
                >
                  Keep it
                </button>
              )}
            </>
          )}
        </div>
      </form>
    </section>
  );
}

type FormErrors = { url?: string; comment?: string; form?: string };

/**
 * What went wrong, next to the field it went wrong in — Design.md §8: say what
 * happened and whether their work is safe. Nothing typed is ever cleared by one of
 * these, so every message can honestly be about what to do next.
 */
function describe(error: unknown, action: "save" | "remove"): FormErrors {
  // Failing to remove something is not failing to save it, and a learner told the
  // wrong one goes looking for a problem they do not have.
  const failed = action === "remove" ? "Bud couldn't remove that." : "Bud couldn't save that.";
  const intact =
    action === "remove"
      ? "Your link is still here, and still handed in — try again in a moment."
      : "Your link is still here — try again in a moment.";

  if (error instanceof BudApiWakingError) {
    return { form: `Bud's server is waking up. ${intact}` };
  }
  if (error instanceof BudApiUnreachableError) {
    return { form: `Can't reach Bud. ${intact}` };
  }
  if (error instanceof BudApiError) {
    // The API's own field-level messages win: they are the ones that know the rule.
    const fields: FormErrors = {};
    for (const field of error.fieldErrors) {
      const where = field.path.split(".")[0];
      if (where === "url" && !fields.url) fields.url = field.message;
      else if (where === "comment" && !fields.comment) fields.comment = field.message;
      else fields.form ??= field.message;
    }
    if (fields.url || fields.comment || fields.form) return fields;

    // A validation failure the schema did not catch is about the link itself: the
    // service checks the scheme and the length again on its own side.
    if (error.code === "validation_failed") return { url: error.message };
    if (error.code === "not_enrolled") return { form: "You're not enrolled in this course." };
    if (error.code === "unknown_session") {
      return { form: "This session isn't part of the course any more." };
    }
    if (error.isUnauthorized) return { form: "You've been signed out. Sign in again to hand this in." };
    if (error.statusCode === 429) return { form: "Too many tries just now. Give it a moment." };
    return { form: `${failed} Nothing was lost — try again.` };
  }
  return { form: `${failed} Nothing was lost — try again.` };
}

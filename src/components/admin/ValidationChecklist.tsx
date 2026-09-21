import type { ValidationResult } from "@/lib/api";

/**
 * The validation checklist from mockup 1h.
 *
 * The shape is the one agreed with the backend and frozen in Overall Plan §4:
 * a flat, ordered list of { severity, code, message, detail? }, in the order the
 * checks ran, with passes included — the author needs to see what was checked, not
 * only what failed. Publish is gated on errors; warnings never block.
 *
 * Everything below keys off `code` rather than the message text, so the API can
 * reword its prose without breaking this panel or its tests.
 */

/** Hints the panel adds; the API supplies the finding, the UI supplies the fix. */
const HINTS: Record<string, string> = {
  external_script: "Bundle it into the package — courses must not fetch code at runtime.",
  disallowed_extension: "Remove these, or convert them to an allowed type.",
  path_traversal: "Entries must stay inside the package.",
  symlink: "Symlinks are not unpacked; include the real file.",
  size_exceeded: "Compress images, or split the course.",
  duplicate_course_id: "Bump the version in bud.manifest.json.",
  manifest_missing: "The archive needs a bud.manifest.json at its root.",
  entry_missing: "Every session's entry file has to exist in the archive.",
};

export function ValidationChecklist({ results }: { results: ValidationResult[] }) {
  if (results.length === 0) return null;

  return (
    <ul className="space-y-3" data-testid="validation-results">
      {results.map((result, i) => (
        <li key={`${result.code}-${i}`} className="flex gap-3" data-code={result.code}>
          <Icon severity={result.severity} code={result.code} />
          <div className="min-w-0 flex-1 text-sm">
            <p className={result.severity === "error" ? "font-semibold" : undefined}>
              {result.message}
            </p>
            {result.detail && (
              <p className="mt-0.5 whitespace-pre-line break-words font-mono text-xs text-[var(--muted-foreground)]">
                {result.detail}
              </p>
            )}
            {HINTS[result.code] && result.severity !== "pass" && (
              <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                {HINTS[result.code]}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * checks_skipped is set apart from an ordinary warning on purpose. A warning means
 * "fine, but noted"; this one means "there is more to find once you fix the error
 * above", which is a different thing for the author to do.
 */
function Icon({ severity, code }: { severity: ValidationResult["severity"]; code: string }) {
  if (code === "checks_skipped") {
    return (
      <span
        aria-label="Checks skipped"
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-[var(--border)] font-mono text-xs text-[var(--muted-foreground)]"
      >
        …
      </span>
    );
  }

  if (severity === "error") {
    return (
      <span
        aria-label="Error"
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--danger)] text-xs font-bold text-white"
      >
        ✕
      </span>
    );
  }

  if (severity === "warning") {
    return (
      <span
        aria-label="Warning"
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-gold-400)] text-xs font-bold text-[var(--color-ink)]"
      >
        !
      </span>
    );
  }

  return (
    <span
      aria-label="Passed"
      className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-leaf-500)] text-xs font-bold text-white"
    >
      ✓
    </span>
  );
}

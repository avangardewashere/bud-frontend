"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  BudApiError,
  BudApiUnreachableError,
  budApi,
  type CourseSpecInfo,
  type IngestResult,
} from "@/lib/api";
import { ValidationChecklist } from "./ValidationChecklist";

/**
 * The upload drop zone from mockup 1h.
 *
 * Validation lives on the server — the rules that matter need the archive unpacked,
 * so a copy here could only ever be the manifest-JSON subset, and a partial drifting
 * subset is worse than none. What runs here is only what needs no rules at all: is
 * it a zip, and is it under the cap. That cannot disagree with the server, and it
 * saves pushing 60MB before being told no.
 *
 * The cap comes from the API's own /course-spec/schema rather than a constant here,
 * for the same reason.
 */
export function UploadCourse({ spec }: { spec: CourseSpecInfo }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResult | null>(null);

  const maxMb = Math.round(spec.limits.maxArchiveBytes / (1024 * 1024));

  function checkBeforeUploading(file: File) {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      return "A course is a .zip containing bud.manifest.json and its files.";
    }
    if (file.size > spec.limits.maxArchiveBytes) {
      return `That archive is ${Math.round(file.size / (1024 * 1024))} MB. The limit is ${maxMb} MB.`;
    }
    return null;
  }

  async function upload(file: File) {
    setName(file.name);
    setResult(null);

    const problem = checkBeforeUploading(file);
    setPreflight(problem);
    if (problem) return;

    setBusy(true);
    try {
      const ingest = await budApi.uploadCourse(file);
      setResult(ingest);
      // A published or drafted course changes the table above.
      if (ingest.ok) router.refresh();
    } catch (error) {
      setPreflight(
        error instanceof BudApiUnreachableError
          ? "Couldn't reach Bud just now."
          : error instanceof BudApiError
            ? error.message
            : "That upload didn't work.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void upload(file);
        }}
        className={
          "flex flex-col items-center justify-center rounded-[var(--radius-panel)] border border-dashed p-10 text-center " +
          (dragging ? "border-[var(--ring)] bg-[var(--tint)]" : "border-[var(--border)]")
        }
      >
        <span
          aria-hidden
          className="flex size-10 items-center justify-center rounded-[10px] bg-[var(--tint)] text-lg text-[var(--tint-foreground)]"
        >
          ↑
        </span>
        <p className="mt-4 text-lg font-semibold">Drop a course zip</p>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          {spec.manifestFilename} + files · up to {maxMb} MB
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
        <Button
          variant="secondary"
          className="mt-4"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          Choose a file
        </Button>

        {name && (
          <p className="mt-4 font-mono text-xs text-[var(--muted-foreground)]">
            {name}
            {busy && " · validating…"}
          </p>
        )}
        {preflight && (
          <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
            {preflight}
          </p>
        )}
      </div>

      <div className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--card)] p-5">
        {result ? (
          <>
            <h3 className="text-lg">
              {result.course ? `Validation · ${result.course.slug}` : "Validation"}
            </h3>
            <div className="mt-4">
              <ValidationChecklist results={result.results} />
            </div>
            <p className="mt-5 text-sm text-[var(--muted-foreground)]">
              {result.ok
                ? "Uploaded as a draft. Publish it from the table above when you're ready."
                : "Publish unlocks when the errors are fixed."}
            </p>
          </>
        ) : (
          <div className="flex h-full flex-col justify-center text-sm text-[var(--muted-foreground)]">
            <p>
              Checks run on the server once the archive is uploaded: the manifest against{" "}
              <span className="font-mono">{spec.spec}</span>, every session entry, and the
              archive itself.
            </p>
            <p className="mt-3">
              Allowed file types:{" "}
              <span className="font-mono">{spec.allowedExtensions.join(" ")}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

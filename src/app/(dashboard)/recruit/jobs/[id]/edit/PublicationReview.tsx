"use client";

import { useEffect, useRef } from "react";

export function PublicationReview({
  form,
  currentStatus,
  active,
  showSalary,
  busy,
  error,
  onConfirm,
  onBack,
}: {
  form: FormData;
  currentStatus: string;
  active: boolean;
  showSalary: boolean;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const failure = useRef<HTMLParagraphElement>(null);
  const publicListing = form.get("listOnPublicJobBoard") === "on";
  const action = publicListing
    ? currentStatus === "open"
      ? "Update publication"
      : currentStatus === "closed"
        ? "Reopen and publish job"
        : "Publish job"
    : "Open for internal hiring";
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    if (error) failure.current?.focus();
  }, [error]);
  return (
    <section className="space-y-4 pb-28" aria-label="Review publication">
      <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold text-[var(--text)]">
        Review publication
      </h2>
      <p className="text-sm text-[var(--text-muted)]">
        {publicListing
          ? "The title, location and job description below will be public. Candidates can apply while this role is open."
          : "Public listing is off. This role will open for internal hiring without a public application link."}
      </p>
      {!active && (
        <p role="alert" className="text-sm text-[var(--status-warning-fg)]">
          This job is inactive. Its active status must be restored before publishing.
        </p>
      )}
      <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h3 className="text-lg font-semibold text-[var(--text)]">
          {String(form.get("title") ?? "")}
        </h3>
        <p className="text-sm text-[var(--text-muted)]">{String(form.get("location") ?? "")}</p>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          {showSalary
            ? `Salary: ₹${String(form.get("compensationMin") || "Not specified")} – ₹${String(form.get("compensationMax") || "Not specified")}`
            : "Salary is not shown publicly."}
        </p>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)]">
          {String(form.get("description") ?? "")}
        </p>
      </article>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--border)] bg-[var(--bg)] p-4">
        {error && (
          <p
            ref={failure}
            tabIndex={-1}
            role="alert"
            className="mb-2 text-sm text-[var(--status-danger-fg)]"
          >
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={busy}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
          >
            Back to editing
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || !active}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
          >
            {busy ? "Saving…" : action}
          </button>
        </div>
      </div>
    </section>
  );
}

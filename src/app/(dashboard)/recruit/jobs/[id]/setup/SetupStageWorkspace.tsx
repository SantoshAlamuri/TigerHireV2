"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useOptimisticMutation, invalidateQueries } from "@/lib/hooks/use-api";
import type { SetupStep } from "@/lib/v2/setup-sequence";
import { JdBaseSetupStep } from "../components/JdBaseSetupStep";
import { JobEditor } from "../edit/JobEditor";

export function SetupStageWorkspace({
  jobId,
  steps,
  description,
  scoringEnabled,
}: {
  jobId: string;
  steps: SetupStep[];
  description: string;
  scoringEnabled: boolean;
}) {
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      steps.findIndex((s) => s.state !== "done"),
    ),
  );
  const [jd, setJd] = useState(description);
  const [saved, setSaved] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const stage = steps[index];
  const { mutate, loading, error } = useOptimisticMutation<unknown, { description: string }>(
    `/api/jobs/${jobId}`,
    { method: "PATCH" },
  );
  useEffect(() => {
    heading.current?.focus();
  }, [index]);
  async function save(advance: boolean) {
    const result = await mutate({ description: jd });
    if (result) {
      setSaved(true);
      invalidateQueries("/api/jobs");
      if (advance) setIndex(2);
    }
  }
  return (
    <div className="pb-28">
      <ol aria-label="Hiring setup progress" className="mb-5 grid gap-2 sm:grid-cols-5">
        {steps.map((s, i) => (
          <li key={s.key}>
            <button
              type="button"
              onClick={() => setIndex(i)}
              aria-current={index === i ? "step" : undefined}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${index === i ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)]"}`}
            >
              {i + 1}. {s.title}
            </button>
          </li>
        ))}
      </ol>
      <h2 ref={heading} tabIndex={-1} className="mb-3 text-lg font-semibold">
        {stage.title}
      </h2>
      {index === 0 && (
        <section className="space-y-3 rounded-xl border border-[var(--border)] p-4">
          <p className="text-sm text-[var(--text-muted)]">{stage.detail}</p>
          <Link className="text-sm font-semibold text-[var(--accent)]" href={stage.href}>
            View request and approval
          </Link>
        </section>
      )}
      {index === 1 && (
        <form
          id="guided-jd"
          onSubmit={(e) => {
            e.preventDefault();
            void save(true);
          }}
          className="space-y-3"
        >
          <label className="block text-sm">
            Job description
            <textarea
              required
              minLength={50}
              rows={12}
              value={jd}
              onChange={(e) => {
                setJd(e.target.value);
                setSaved(false);
              }}
              className="mt-2 max-h-[50vh] w-full rounded-lg border border-[var(--border-interactive)] bg-[var(--surface)] p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </label>
          <p role="status" className="text-sm text-[var(--text-muted)]">
            {saved ? "Job description saved" : "Changes not yet saved"}
          </p>
          {error && (
            <p role="alert" className="text-sm text-[var(--status-danger-fg)]">
              {error}
            </p>
          )}
        </form>
      )}
      {(index === 2 || index === 3) &&
        (scoringEnabled ? (
          <JdBaseSetupStep
            jobId={jobId}
            guidedStep={index === 2 ? 1 : 2}
            onRequirementsSaved={() => setIndex(3)}
            onGuidedApproved={() => setIndex(4)}
          />
        ) : (
          <p className="text-sm text-[var(--text-muted)]">
            Role-specific evaluation is not enabled for this organisation.
          </p>
        ))}
      {index === 4 && <JobEditor />}
      {index < 4 && (
        <div
          className={
            index < 2
              ? "fixed inset-x-0 bottom-0 z-20 flex flex-wrap items-center gap-3 border-t border-[var(--border)] bg-[var(--bg)] px-4 py-3"
              : "mt-5 flex flex-wrap items-center gap-3 border-t border-[var(--border)] bg-[var(--bg)] py-3"
          }
        >
          <button
            type="button"
            disabled={index === 0 || loading}
            onClick={() => setIndex(index - 1)}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-40"
          >
            Back
          </button>
          {index === 1 ? (
            <>
              <button
                type="button"
                disabled={loading || jd.trim().length < 50}
                onClick={() => void save(false)}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
              >
                {loading ? "Saving…" : "Save draft"}
              </button>
              <button
                type="submit"
                form="guided-jd"
                disabled={loading}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black"
              >
                Save & continue
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setIndex(index + 1)}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
            >
              {index === 0 ? "Continue" : "Next step"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

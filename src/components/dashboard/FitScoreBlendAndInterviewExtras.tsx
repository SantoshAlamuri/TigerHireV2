"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { FitScore } from "@/types";

/** Alternate-score blend row + interview prompts (matches `FitScoreCard` footer behavior). */
export function FitScoreBlendAndInterviewExtras({
  score,
  onRefetch,
  /** super_admin-only: alternate shadow blend controls (internal QA). Interview prompts always shown when present. */
  showAlternateScoreControls = false,
}: {
  score: FitScore;
  onRefetch?: () => void | Promise<unknown>;
  showAlternateScoreControls?: boolean;
}) {
  const [blendLoading, setBlendLoading] = useState(false);
  const [blendError, setBlendError] = useState<string | null>(null);

  const usingShadow = score.recruiterSelected === "shadow";
  const otherScore =
    usingShadow && score.primaryScore != null ? score.primaryScore : score.shadowScore;
  const showShadowRow =
    showAlternateScoreControls &&
    Boolean(onRefetch) &&
    score.shadowScore != null &&
    (score.primaryScore != null || score.shadowScore !== score.overallScore) &&
    otherScore != null;

  async function handleSelectBlend(selection: "primary" | "shadow") {
    if (!onRefetch || !score.jobPostingId || !score.candidateId) return;
    setBlendLoading(true);
    setBlendError(null);
    try {
      const res = await fetch("/api/fitscore/select-blend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: score.jobPostingId,
          candidate_id: score.candidateId,
          selection,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message = typeof body?.error === "string" ? body.error : "Failed to save selection";
        setBlendError(message);
        throw new Error(message);
      }
      await onRefetch();
    } finally {
      setBlendLoading(false);
    }
  }

  const idealGaps = (score.idealGaps ?? []).filter((gap) => typeof gap === "string" && gap.trim());
  const gapDerivedInterviewQuestions = idealGaps.map(
    (gap) => `Tell me about your experience with ${gap}.`,
  );
  const allInterviewQuestions = [
    ...gapDerivedInterviewQuestions,
    ...(score.interviewAngles ?? []),
  ].filter((question, idx, arr) => Boolean(question?.trim()) && arr.indexOf(question) === idx);

  if (!showShadowRow && allInterviewQuestions.length === 0) return null;

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/40 p-5 backdrop-blur-sm">
      {showShadowRow ? (
        <div
          className="flex flex-wrap items-center justify-end gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/80 px-4 py-2 text-xs"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <span
            className="text-[var(--text-muted)]"
            title="A second scoring blend that weighs criteria differently. Compare both to calibrate."
          >
            Alternate score: <strong className="text-[var(--text)]">{otherScore}</strong>
          </span>
          {blendError ? (
            <span className="text-red-500" role="alert">
              {blendError}
            </span>
          ) : null}
          {blendLoading ? (
            <Loader2 size={12} className="animate-spin text-[var(--text-muted)]" />
          ) : usingShadow ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void handleSelectBlend("primary");
              }}
              className="rounded border border-[var(--border)] px-2 py-0.5 text-[var(--text-muted)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]"
            >
              Use original score
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void handleSelectBlend("shadow");
              }}
              className="rounded border border-[var(--border)] px-2 py-0.5 text-[var(--accent)] transition hover:bg-[var(--bg-elevated)]"
            >
              Use this score
            </button>
          )}
        </div>
      ) : null}

      {allInterviewQuestions.length > 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Interview questions
          </p>
          <ul className="mt-1.5 space-y-1.5 text-body text-sm text-[var(--text)]">
            {allInterviewQuestions.map((question, idx) => (
              <li key={`${idx}-${question}`} className="flex items-start gap-2">
                <span className="mt-0.5 text-[var(--text-subtle)]">&#8226;</span>
                <span>{question}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

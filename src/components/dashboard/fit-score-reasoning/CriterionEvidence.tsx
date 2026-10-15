"use client";

import type { FitScore } from "@/types";
import { gradeChipClasses } from "./score-helpers";

type CriterionBreakdownRow = NonNullable<FitScore["criteriaBreakdown"]>[number];

export type CriterionEvidenceProps = {
  items: { criterion: CriterionBreakdownRow; evidence: string | null }[];
};

export function CriterionEvidence({ items }: CriterionEvidenceProps) {
  return (
    <details className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/25 px-4 py-3 ring-1 ring-inset ring-white/[0.04]">
      <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-subtle)] outline-none marker:text-[var(--text-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]">
        Criterion-level evidence
      </summary>
      <div className="mt-3 space-y-2">
        {items.map(({ criterion, evidence }) => (
          <div
            key={criterion.criterion_id}
            className="rounded-xl border border-[var(--border)]/80 bg-[var(--surface)]/40 p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-[var(--text)]">{criterion.criterion_name}</p>
              <span
                className={`rounded-full border px-2 py-0.5 text-xs ${gradeChipClasses(criterion.grade)}`}
              >
                {criterion.grade}
              </span>
            </div>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {criterion.evidence_text || "No reasoning"}
            </p>
            {evidence ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-[var(--accent)]">
                  Evidence from CV
                </summary>
                <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--text-muted)]">
                  {evidence}
                </p>
              </details>
            ) : null}
          </div>
        ))}
      </div>
    </details>
  );
}

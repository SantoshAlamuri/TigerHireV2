"use client";

import type { FitScore } from "@/types";
import { toSentence } from "./helpers";

function renderRubricRows(score: FitScore) {
  if (!score.rubricSnapshot || typeof score.rubricSnapshot !== "object") return null;
  const entries = Object.entries(score.rubricSnapshot);
  if (entries.length === 0) return null;
  return entries.map(([key, value]) => (
    <div
      key={key}
      className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/60 p-2"
    >
      <p className="text-xs font-semibold text-[var(--text)]">{toSentence(key)}</p>
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs text-[var(--text-muted)]">
        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  ));
}

export type RubricModalProps = {
  score: FitScore;
  onClose: () => void;
};

export function RubricModal({ score, onClose }: RubricModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-xl border border-[var(--border)] bg-[var(--bg)] p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--text)]">Rubric used</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-[var(--border)] px-2 py-1 text-xs"
          >
            Close
          </button>
        </div>
        <div className="mt-3 space-y-2">{renderRubricRows(score)}</div>
      </div>
    </div>
  );
}

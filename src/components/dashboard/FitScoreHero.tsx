"use client";

import type { FitScore } from "@/types";

function confidenceLabel(confidence?: string): string {
  if (!confidence) return "Confidence unavailable";
  if (confidence === "high") return "High confidence";
  if (confidence === "medium") return "Medium confidence";
  if (confidence === "low") return "Low confidence";
  return `${confidence} confidence`;
}

function bandClasses(band?: string): string {
  const value = (band ?? "").toLowerCase();
  if (value.includes("strong")) return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  if (value.includes("good")) return "bg-sky-500/15 text-sky-300 border-sky-500/30";
  if (value.includes("moderate")) return "bg-amber-500/15 text-amber-300 border-amber-500/30";
  if (value.includes("weak") || value.includes("not"))
    return "bg-red-500/15 text-red-300 border-red-500/30";
  return "bg-[var(--bg-elevated)] text-[var(--text)] border-[var(--border)]";
}

export function FitScoreHero({ score }: { score: FitScore }) {
  const modelName = score.extractionModel ?? score.modelVersion;
  // The fallback path is deterministic keyword matching, not a model call. Calling
  // it "Sonnet fallback" told recruiters a frontier model had scored the CV when a
  // regex had — the opposite of the explainability the product promises.
  const modelFootnote =
    score.extractionFallback === true
      ? `${modelName} · keyword fallback (no AI reasoning)`
      : modelName;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-[var(--text-subtle)]">Fit score</p>
          <p className="text-5xl font-bold leading-none text-[var(--text)]">
            {score.overallScore}
            <span className="ml-1 text-xl text-[var(--text-muted)]">/100</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${bandClasses(score.band)}`}
          >
            {score.band ?? score.rating}
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            {confidenceLabel(score.confidence)}
          </span>
        </div>
      </div>
      <p className="mt-3 text-xs text-[var(--text-subtle)]">Evaluated with {modelFootnote}</p>
    </div>
  );
}

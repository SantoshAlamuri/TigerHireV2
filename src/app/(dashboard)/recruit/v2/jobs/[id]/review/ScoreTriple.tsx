"use client";

import type { ScorePanel } from "@/lib/v2/score-panel";

/**
 * The three scores, ranked by size so the eye lands on FitScore first.
 * ICP match and market rank sit beside it because a score means little without
 * knowing what it was measured against and how the pool compares.
 */
export function ScoreTriple({ panel }: { panel: ScorePanel }) {
  const cells = [panel.fit, panel.icp, panel.market];
  return (
    <div className="flex max-w-full flex-wrap">
      {cells.map((c, i) => (
        <div
          key={c.label}
          className={`px-3 text-right ${i > 0 ? "border-l border-[var(--border)]" : ""}`}
        >
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
            {c.label}
          </div>
          <div
            className={`font-mono font-semibold tabular-nums ${
              i === 0 ? "text-3xl" : "pt-0.5 text-lg"
            } text-[var(--text)]`}
          >
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

"use client";

import { useState } from "react";
import type { DemoScoredCandidate } from "@/lib/agents/demo-score";
import styles from "@/app/(public)/v2/v2.module.css";

function scoreBand(score: number): string {
  if (score >= 75) return styles.scoreStrong;
  if (score >= 60) return styles.scoreMid;
  return styles.scoreLow;
}

const FLAG_CLASS = { ok: styles.flagOk, warn: styles.flagWarn, miss: styles.flagMiss } as const;
const FLAG_MARK = { ok: "✓", warn: "⚠", miss: "✗" } as const;

/**
 * Evidence card + ranked leaderboard. Any row can be selected to inspect
 * that candidate's full scorecard; the top-ranked candidate is shown first.
 */
export default function DemoResults({ candidates }: { candidates: DemoScoredCandidate[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = candidates.find((c) => c.id === selectedId) ?? candidates[0];
  if (!selected) return null;
  const strongVerdict =
    selected.result.verdict === "STRONG_HIRE" || selected.result.verdict === "HIRE";

  return (
    <div>
      <div className={styles.ecard}>
        <div className="mb-4 flex items-center gap-3.5">
          <div className="flex h-11 w-11 flex-none items-center justify-center rounded-[10px] bg-[var(--accent-muted)] font-extrabold text-[var(--accent)]">
            {selected.initials}
          </div>
          <div>
            <div className="text-[15.5px] font-bold">{selected.name}</div>
            <div className="text-[13px] text-[var(--text-subtle)]">{selected.headline}</div>
          </div>
          <span className={`${styles.verdictPill} ${strongVerdict ? "" : styles.verdictPillMuted}`}>
            {selected.result.verdict.replace("_", " ")}
          </span>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2.5">
          <div className={styles.statBox}>
            <div className={`${styles.statValue} text-[var(--accent)]`}>
              {selected.result.fitScore}
              <span className="text-xs text-[var(--text-subtle)]">/100</span>
            </div>
            <div
              className={`${styles.mono} mt-1 text-[10px] uppercase tracking-[0.1em] text-[var(--text-subtle)]`}
            >
              FitScore
            </div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statValue}>
              {selected.result.idealMatch}
              <span className="text-xs text-[var(--text-subtle)]">%</span>
            </div>
            <div
              className={`${styles.mono} mt-1 text-[10px] uppercase tracking-[0.1em] text-[var(--text-subtle)]`}
            >
              Ideal match
            </div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statValue}>{selected.result.confidence.toFixed(2)}</div>
            <div
              className={`${styles.mono} mt-1 text-[10px] uppercase tracking-[0.1em] text-[var(--text-subtle)]`}
            >
              Confidence
            </div>
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-1.5 text-[13.5px]">
          {selected.result.flags.map((flag) => (
            <div key={flag.text} className="flex items-baseline gap-2 text-[var(--text-muted)]">
              <span className={`${styles.mono} flex-none ${FLAG_CLASS[flag.type]}`}>
                {FLAG_MARK[flag.type]}
              </span>
              <span>{flag.text}</span>
            </div>
          ))}
        </div>

        <div className={styles.whyQuote}>&ldquo;{selected.result.rationale}&rdquo;</div>
      </div>

      <p
        className={`${styles.mono} mt-3.5 text-[11px] uppercase tracking-[0.1em] text-[var(--text-subtle)]`}
      >
        Click any candidate to see their full scorecard
      </p>
      <div className="mt-1.5 flex flex-col gap-1.5">
        {candidates.map((candidate, i) => {
          const isSelected = candidate.id === selected.id;
          return (
            <button
              key={candidate.id}
              type="button"
              onClick={() => setSelectedId(candidate.id)}
              aria-pressed={isSelected}
              className={`${styles.rankRow} ${i < 2 ? styles.rankTop : ""} ${
                isSelected ? styles.rankSelected : ""
              } cursor-pointer text-left transition hover:border-[var(--border-hover)]`}
            >
              <span className="w-5 text-[var(--text-subtle)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{candidate.name}</span>
              <span className="text-[var(--text-subtle)]">{candidate.headline}</span>
              <span className={`ml-auto ${scoreBand(candidate.result.fitScore)}`}>
                {candidate.result.fitScore}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

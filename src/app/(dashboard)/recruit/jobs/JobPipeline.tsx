"use client";

import { ORDINAL } from "@/lib/v2/viz";
import type { PipelineCounts } from "@/lib/v2/job-pipeline";

/**
 * The funnel for one job, inline in the jobs list.
 *
 * This was a right-aligned string of arrows — "5 → 5 → 0 → 0 → 0" — in the
 * smallest type on the row, which made the single most useful fact about a job
 * unreadable and unlabelled. A recruiter scanning this list is asking "where is
 * each role stuck", and that question needs stage names next to the counts.
 *
 * Stages that are empty stay visible and dimmed rather than being dropped: a
 * zero at Interview is the finding, and hiding it would leave a shorter funnel
 * that reads as healthy.
 *
 * These are NOT cumulative funnel stages. Everything after the total is where a
 * candidate stands RIGHT NOW, so the row can legitimately read 5 total, 0 to
 * review, 5 shortlisted — the five were reviewed and moved on. Labelling that
 * "Applied → To review → Shortlisted" implied a conversion and made a healthy
 * job look like it converted upward, which is impossible. The heading says
 * occupancy, and the total is named Total rather than Applied.
 */
const STAGES = [
  { key: "applied", label: "Total" },
  { key: "awaitingReview", label: "To review" },
  { key: "shortlisted", label: "Shortlisted" },
  { key: "interviewed", label: "Interview" },
  { key: "hired", label: "Hired" },
] as const;

export function JobPipeline({ counts }: { counts: PipelineCounts | undefined }) {
  if (!counts || counts.applied === 0) {
    return (
      <span className="text-[11px] text-white/25">
        No applicants yet — sourcing has not started
      </span>
    );
  }

  return (
    <span className="block">
      <span className="mb-1 block text-[8.5px] font-semibold uppercase tracking-[0.1em] text-white/25">
        Where they are now
      </span>
      <span className="flex items-stretch gap-px overflow-hidden rounded-lg">
        {STAGES.map((s, i) => {
          const value = counts[s.key];
          const empty = value === 0;
          return (
            <span
              key={s.key}
              className="min-w-[62px] flex-1 px-2 py-1.5"
              style={{
                // Ordered ramp: later stages read as deeper, so the shape of the
                // funnel is legible before any number is.
                background: empty ? "rgba(255,255,255,0.03)" : `${ORDINAL[i]}22`,
              }}
              title={`${s.label}: ${value}`}
            >
              <span className="block text-[8.5px] font-semibold uppercase tracking-[0.08em] text-white/35">
                {s.label}
              </span>
              <span
                className={`block font-mono text-[15px] font-semibold leading-tight tabular-nums ${
                  empty ? "text-white/20" : "text-[var(--text)]"
                }`}
              >
                {value}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}

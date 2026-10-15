"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertCircle, CalendarPlus } from "lucide-react";
import type { JobSchedulingSummary } from "@/lib/calendar/org-calendar-scheduling-summary";

/** Rows shown before the list collapses behind a "+N more" expander. */
const GAPS_PREVIEW_COUNT = 2;

export function CalendarSchedulingGaps({
  summaries,
  loading,
}: {
  summaries: JobSchedulingSummary[];
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (loading) {
    return (
      <div className="card-lifted animate-pulse p-4">
        <div className="h-4 w-40 rounded bg-white/10" />
        <div className="mt-3 h-10 rounded bg-white/5" />
      </div>
    );
  }

  const needsSlots = summaries.filter((s) => s.availableCount === 0);
  const hasOpen = summaries.filter((s) => s.availableCount > 0);

  if (summaries.length === 0) {
    return (
      <div className="card-lifted border-amber-500/20 bg-amber-500/[0.06] p-4">
        <p className="text-sm font-medium text-amber-100/95">No open jobs in this range</p>
        <p className="mt-1 text-xs text-white/60">
          Open a job plan and use Scheduling to publish interview times.
        </p>
      </div>
    );
  }

  return (
    <section className="card-lifted p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="heading-section text-sm text-[var(--text)]">Scheduling gaps</h2>
          <p className="mt-0.5 text-xs text-white/60">
            Open slots in the selected week — click a job to add times or book candidates.
          </p>
        </div>
        {hasOpen.length > 0 && (
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-200">
            {hasOpen.length} job{hasOpen.length === 1 ? "" : "s"} with open times
          </span>
        )}
      </div>

      {needsSlots.length > 0 ? (
        <ul className="mb-3 space-y-2">
          {(expanded ? needsSlots : needsSlots.slice(0, GAPS_PREVIEW_COUNT)).map((job) => (
            <li key={job.jobId}>
              <Link
                href={job.href}
                className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.08] px-3 py-2.5 transition hover:border-amber-400/40 hover:bg-amber-500/12"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <AlertCircle size={16} className="shrink-0 text-amber-300" />
                  <span className="truncate text-sm font-medium text-[var(--text)]">
                    {job.jobTitle}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[var(--accent)]">
                  <CalendarPlus size={14} />
                  Add slots
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {hasOpen.length > 0 ? (
        <ul className="space-y-1.5">
          {hasOpen.slice(0, 8).map((job) => (
            <li key={job.jobId}>
              <Link
                href={job.href}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2 text-sm transition hover:border-[var(--accent)]/40 hover:bg-white/[0.03]"
              >
                <span className="truncate font-medium text-[var(--text)]">{job.jobTitle}</span>
                <span className="shrink-0 text-xs text-white/55">
                  <span className="font-semibold text-emerald-300">{job.availableCount}</span> open
                  {job.bookedCount > 0 ? (
                    <>
                      {" "}
                      · <span className="text-amber-200/90">{job.bookedCount}</span> booked
                    </>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {needsSlots.length > GAPS_PREVIEW_COUNT ? (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-2 text-xs font-medium text-[var(--accent)] transition hover:underline"
        >
          {expanded
            ? "Show fewer"
            : `+${needsSlots.length - GAPS_PREVIEW_COUNT} more jobs need slots in this range`}
        </button>
      ) : null}
    </section>
  );
}

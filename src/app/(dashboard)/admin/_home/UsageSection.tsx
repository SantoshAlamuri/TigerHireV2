"use client";

import { Skeleton } from "@/components/ui/Skeleton";
import { REPORT_CARD_CLASS } from "./helpers";
import type { UsageSummaryResponse } from "./types";

type UsageSectionProps = {
  usageSummaryLoading: boolean;
  usageSummaryData: UsageSummaryResponse | null | undefined;
  usageSummaryError: unknown;
};

export function UsageSection({
  usageSummaryLoading,
  usageSummaryData,
  usageSummaryError,
}: UsageSectionProps) {
  return (
    <section className={REPORT_CARD_CLASS}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="heading-section text-lg text-[var(--text)]">Usage summary</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {usageSummaryData?.organisationId === "all"
              ? "All organisations · includes drafts and closed jobs"
              : "Organisation usage · includes drafts and closed jobs"}
          </p>
        </div>
      </div>
      {usageSummaryLoading && !usageSummaryData ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : usageSummaryError ? (
        <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Could not load usage summary.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/60 p-3">
            <p className="text-xs text-[var(--text-muted)]">Total jobs</p>
            <p className="mt-1 text-xl font-semibold text-[var(--text)]">
              {usageSummaryData?.jobsCount ?? 0}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/60 p-3">
            <p className="text-xs text-[var(--text-muted)]">Candidates processed</p>
            <p className="mt-1 text-xl font-semibold text-[var(--text)]">
              {usageSummaryData?.candidatesProcessed ?? 0}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/60 p-3">
            <p className="text-xs text-[var(--text-muted)]">Fit scores computed</p>
            <p className="mt-1 text-xl font-semibold text-[var(--text)]">
              {usageSummaryData?.fitScoresComputed ?? 0}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/60 p-3">
            <p className="text-xs text-[var(--text-muted)]">Generated at</p>
            <p className="mt-1 text-sm text-[var(--text)]">
              {usageSummaryData?.generatedAt
                ? new Date(usageSummaryData.generatedAt).toLocaleString()
                : "n/a"}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

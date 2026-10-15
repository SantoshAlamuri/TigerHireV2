"use client";

import { useMemo } from "react";
import { fuseJobTable } from "@/lib/v2/analytics-jobs";
import type { V1Analytics } from "./useV1Analytics";

/**
 * Shapes the loaded application rows for the views that still need per-row
 * detail, and folds in the server-side per-job totals.
 *
 * Every view reads the same source here, so no two tabs can disagree about what
 * happened — the failure that had Overview reporting "Applied 100" (the page
 * limit) while By-job summed real org totals.
 */
interface Row {
  status?: string | null;
  source?: string | null;
  job_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  offer_accepted_at?: string | null;
  jobs?: { title?: string | null; created_at?: string | null } | null;
  fit_scores?: { overall_score?: number | null } | null;
}

export function useAnalyticsRows(rows: Row[], v1: V1Analytics) {
  // Trends, By-job and Quality all read the same rows, so no view can disagree
  // with another about what happened.
  const trendRows = useMemo(
    () =>
      rows.map((r) => ({
        status: r.status ?? "applied",
        createdAt: r.created_at ?? null,
        decidedAt:
          r.status === "shortlisted" || r.status === "rejected" || r.status === "hired"
            ? (r.updated_at ?? r.created_at ?? null)
            : null,
      })),
    [rows],
  );
  const diagRows = useMemo(
    () =>
      rows.map((r) => ({
        jobId: r.job_id ?? "",
        jobTitle: r.jobs?.title ?? "",
        jobCreatedAt: r.jobs?.created_at ?? null,
        status: r.status ?? "applied",
        source: r.source ?? null,
        // Rubric state is not on this payload; unknown must not read as absent.
        hasRubric: null as boolean | null,
      })),
    [rows],
  );
  const qualityRows = useMemo(
    () =>
      rows.map((r) => ({
        status: r.status ?? "applied",
        createdAt: r.created_at ?? null,
        hiredAt: r.offer_accepted_at ?? null,
        hasScore: r.fit_scores?.overall_score != null,
      })),
    [rows],
  );
  // Server-side per-job totals beat counting a page of applications.
  const fusedJobs = useMemo(
    () =>
      fuseJobTable(
        v1.pipeline,
        v1.timeToHire,
        Object.fromEntries(
          rows
            .filter((r) => r.job_id && r.jobs?.created_at)
            .map((r) => [
              r.job_id as string,
              Math.max(
                0,
                Math.floor((Date.now() - Date.parse(r.jobs!.created_at as string)) / 86_400_000),
              ),
            ]),
        ),
        v1.clearRateByJob,
      ),
    [v1.pipeline, v1.timeToHire, v1.clearRateByJob, rows],
  );

  return { trendRows, diagRows, qualityRows, fusedJobs };
}

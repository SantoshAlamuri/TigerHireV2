/**
 * Client-only: sequential calls to POST /api/agency/reprocess-candidates (one id per request).
 * Used after bulk upload and for “Score all pending” so progress and errors stay consistent.
 */
export type AgencyReprocessQueueItemResult = {
  candidateId: string;
  success: boolean;
  score?: number | null;
  candidateName?: string | null;
  /** When present, apply scores only to pipeline rows whose `job_id` matches. */
  jobScores?: { jobId: string; score: number | null }[];
  error?: string;
};

/** Rows returned by agency upload-profile (single or bulk) for result panels in the UI. */
export type AgencyUploadBulkResultRow = {
  fileName: string;
  success: boolean;
  candidateId?: string;
  candidateName?: string | null;
  jobsScored?: number;
  topScore?: number | null;
  parsingPending?: boolean;
  error?: string;
};

/**
 * Updates optimistic Kanban scores after reprocess: never reuse `topScore` across different jobs.
 */
export function applyJobScopedScoresToOptimisticMap(
  prev: Record<string, number>,
  entries: Array<{ id: string; candidate_id: string; job_id: string }>,
  candidateId: string,
  jobScores: { jobId: string; score: number | null }[] | undefined,
  legacySingleScore: number | null | undefined,
): Record<string, number> {
  const next = { ...prev };
  if (jobScores?.length) {
    const byJob = new Map(jobScores.map((x) => [x.jobId, x.score]));
    for (const e of entries) {
      if (e.candidate_id !== candidateId) continue;
      const s = byJob.get(e.job_id);
      if (s != null) next[e.id] = s;
    }
    return next;
  }
  if (legacySingleScore != null) {
    const rows = entries.filter((e) => e.candidate_id === candidateId);
    if (rows.length === 1) next[rows[0]!.id] = legacySingleScore;
  }
  return next;
}

export function mergeAgencyReprocessIntoUploadBulkResults(
  prev: AgencyUploadBulkResultRow[],
  reprocessResults: AgencyReprocessQueueItemResult[],
): AgencyUploadBulkResultRow[] {
  const byId = new Map(reprocessResults.map((r) => [r.candidateId, r]));
  return prev.map((r) => {
    if (!r.candidateId) return r;
    const stillPending = r.parsingPending === undefined || r.parsingPending;
    if (!stillPending) return r;
    const retry = byId.get(r.candidateId);
    if (!retry) return r;
    return retry.success
      ? {
          ...r,
          parsingPending: false,
          candidateName: retry.candidateName ?? r.candidateName,
          topScore: retry.score ?? null,
          jobsScored: retry.score != null ? 1 : 0,
          error: undefined,
        }
      : {
          ...r,
          error: retry.error ?? "Processing failed",
        };
  });
}

export async function runAgencyReprocessQueue(
  candidateIds: string[],
  options?: {
    onProgress?: (index: number, total: number, candidateId: string) => void;
    signal?: AbortSignal;
    /**
     * Sync reprocess endpoint to call (one candidate per request). Defaults to the
     * agency route; the company candidate pool passes its own `/api/company/...` route.
     */
    endpoint?: string;
  },
): Promise<AgencyReprocessQueueItemResult[]> {
  const unique = [...new Set(candidateIds.filter(Boolean))];
  const results: AgencyReprocessQueueItemResult[] = [];
  const endpoint = options?.endpoint ?? "/api/agency/reprocess-candidates";

  for (let i = 0; i < unique.length; i++) {
    if (options?.signal?.aborted) break;

    const candidateId = unique[i];
    options?.onProgress?.(i, unique.length, candidateId);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ candidateIds: [candidateId] }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        results?: Array<{
          success: boolean;
          error?: string;
          score?: number | null;
          candidateName?: string | null;
          jobScores?: { jobId: string; score: number | null }[];
        }>;
      };

      const row = json.results?.[0];
      if (!res.ok) {
        results.push({
          candidateId,
          success: false,
          error: json.error ?? `Request failed (${res.status})`,
        });
        continue;
      }
      if (row && !row.success) {
        results.push({
          candidateId,
          success: false,
          error: row.error ?? "Scoring failed",
        });
        continue;
      }
      results.push({
        candidateId,
        success: true,
        score: row?.score ?? null,
        candidateName: row?.candidateName ?? null,
        jobScores: row?.jobScores,
      });
    } catch {
      results.push({ candidateId, success: false, error: "Network error" });
    }
  }

  options?.onProgress?.(unique.length, unique.length, "");
  return results;
}

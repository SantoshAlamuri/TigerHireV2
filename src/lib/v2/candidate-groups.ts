import type { CandidateSummary } from "./candidate-summary";

/**
 * Candidates grouped by the job they are in process for.
 *
 * The page answers "who do I have for this job" before you configure anything —
 * search and filters refine, they are not a prerequisite. Rejected people move
 * to the talent pool rather than disappearing: with a structured reason on each
 * one, a compensation rejection at ₹30L is the first call when a ₹40L role opens.
 */
export interface CandidateRow {
  applicationId: string;
  candidateId: string;
  name: string;
  jobId: string;
  jobTitle: string;
  score: number | null;
  /** True when this score came from the deterministic keyword fallback, not AI — show an indicator so the list doesn't present it as a normal score. */
  isFallbackScore?: boolean;
  /** Candidate-side interest signal, used by the intent filter. Null = unmeasured. */
  intentScore?: number | null;
  status: string;
  rejectionReason?: string | null;
  /** Pre-built one-line detail so a row says something without being opened. */
  summary?: CandidateSummary;
  /** Raw recruiter-facing fields, shown as aligned columns rather than prose. */
  phone?: string | null;
  experienceYears?: number | null;
  location?: string | null;
  noticeDays?: number | null;
  currentCtc?: number | null;
  expectedCtc?: number | null;
  offers?: number | null;
}

export interface JobGroup {
  jobId: string;
  jobTitle: string;
  rows: CandidateRow[];
}

export interface GroupedCandidates {
  groups: JobGroup[];
  pool: CandidateRow[];
  poolByReason: Record<string, number>;
  total: number;
}

export function groupCandidatesByJob(
  rows: CandidateRow[],
  includeRejected = false,
): GroupedCandidates {
  const byJob = new Map<string, JobGroup>();
  const pool: CandidateRow[] = [];
  const poolByReason: Record<string, number> = {};

  for (const row of rows) {
    if (row.status === "rejected" && !includeRejected) {
      pool.push(row);
      const key = row.rejectionReason?.trim() || "unspecified";
      poolByReason[key] = (poolByReason[key] ?? 0) + 1;
      continue;
    }
    const group = byJob.get(row.jobId) ?? {
      jobId: row.jobId,
      jobTitle: row.jobTitle?.trim() || "Untitled job",
      rows: [],
    };
    group.rows.push(row);
    byJob.set(row.jobId, group);
  }

  const groups = [...byJob.values()];
  for (const g of groups) g.rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  // Busiest job first — that is where the recruiter's attention already is.
  groups.sort((a, b) => b.rows.length - a.rows.length);
  pool.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  return { groups, pool, poolByReason, total: rows.length };
}

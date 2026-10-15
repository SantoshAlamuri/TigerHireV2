/**
 * Per-job pipeline counts, so the jobs list can show the funnel and diagnose a
 * blocker from real numbers.
 *
 * The blocker chip on that list was previously computed from a hardcoded
 * applicants: 0 with rubricApproved: true — every job got the same answer, from
 * inputs nobody measured. A diagnosis derived from constants is worse than none
 * because it looks like it read the data.
 */
export interface PipelineCounts {
  applied: number;
  awaitingReview: number;
  shortlisted: number;
  interviewed: number;
  offered: number;
  hired: number;
}

const EMPTY = (): PipelineCounts => ({
  applied: 0,
  awaitingReview: 0,
  shortlisted: 0,
  interviewed: 0,
  offered: 0,
  hired: 0,
});

export function pipelineByJob(
  rows: { job_id?: string | null; status?: string | null }[],
): Map<string, PipelineCounts> {
  const out = new Map<string, PipelineCounts>();
  for (const r of rows) {
    if (!r.job_id) continue;
    const c = out.get(r.job_id) ?? EMPTY();
    // Applied is the total that came in — the top of the funnel, not the
    // remainder sitting untouched at stage one.
    c.applied += 1;
    const s = r.status ?? "applied";
    if (s === "applied") c.awaitingReview += 1;
    if (s === "shortlisted") c.shortlisted += 1;
    if (s === "interviewed") c.interviewed += 1;
    if (s === "offered") c.offered += 1;
    if (s === "hired") c.hired += 1;
    out.set(r.job_id, c);
  }
  return out;
}

export function formatPipeline(c: PipelineCounts): string {
  if (c.applied === 0) return "no applicants yet";
  return [c.applied, c.shortlisted, c.interviewed, c.offered, c.hired].join(" → ");
}

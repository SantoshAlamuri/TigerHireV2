/**
 * Score lookup that does not depend on `applications.fit_score_id`.
 *
 * That column is null on every application row in the database while 432
 * fit_scores exist, so the embedded `fit_scores(...)` join returns nothing and
 * the score renders as an em dash on every screen that trusts it. The review
 * queue was the exception only because it fetches scores separately, which is
 * why the gap went unnoticed: the one screen anybody demoed was the one screen
 * that worked.
 *
 * /api/fit-score?jobId= returns a job's scores in a single request, so this
 * indexes them by candidate rather than adding a fetch per row.
 */
export interface ScoreRow {
  candidate_id?: string | null;
  job_id?: string | null;
  overall_score?: number | null;
  /** Persisted fit label (JD-threshold-derived), e.g. "Strong Fit". Preferred for the band chip. (#350) */
  band?: string | null;
  ideal_match_pct?: number | null;
  market_percentile?: number | null;
  market_label?: string | null;
  one_line_summary?: string | null;
  green_flags?: (string | null)[] | null;
  amber_flags?: (string | null)[] | null;
  red_flags?: (string | null)[] | null;
  created_at?: string | null;
}

function newer(a: ScoreRow, b: ScoreRow): ScoreRow {
  const ta = a.created_at ? Date.parse(a.created_at) : NaN;
  const tb = b.created_at ? Date.parse(b.created_at) : NaN;
  // An undated row must not displace a dated one — rescoring history is the
  // whole reason there is more than one row per candidate.
  if (Number.isNaN(tb)) return a;
  if (Number.isNaN(ta)) return b;
  return tb > ta ? b : a;
}

export function indexScoresByCandidate(rows: ScoreRow[]): Map<string, ScoreRow> {
  const out = new Map<string, ScoreRow>();
  for (const r of rows) {
    const key = r.candidate_id;
    if (!key) continue;
    const existing = out.get(key);
    out.set(key, existing ? newer(existing, r) : r);
  }
  return out;
}

/**
 * The score to show for one candidate. A candidate can be scored against
 * several jobs, and showing another job's number on this job's screen is how a
 * "56 here, 52 there" contradiction gets in front of a recruiter.
 */
export function pickScoreFor(rows: ScoreRow[], jobId: string | null | undefined): ScoreRow | null {
  if (rows.length === 0) return null;
  const forJob = rows.filter((r) => r.job_id === jobId);
  const pool = forJob.length ? forJob : rows;
  return pool.reduce((best, r) => newer(best, r));
}

/**
 * Name → candidate id, but only for names that belong to exactly one person.
 *
 * The interviews feed identifies candidates by name, with no id. Matching on a
 * shared name would show one candidate's score against another's interview —
 * a wrong number attached to a real person, which is worse than a dash. Names
 * that appear twice are deliberately left out.
 */
export function candidateIdByUniqueName(
  apps: { candidate_id?: string | null; candidates?: { name?: string | null } | null }[],
): Map<string, string> {
  const counts = new Map<string, string[]>();
  for (const a of apps) {
    const name = a.candidates?.name?.trim().toLowerCase();
    if (!name || !a.candidate_id) continue;
    const list = counts.get(name) ?? [];
    if (!list.includes(a.candidate_id)) list.push(a.candidate_id);
    counts.set(name, list);
  }
  const out = new Map<string, string>();
  for (const [name, ids] of counts) if (ids.length === 1) out.set(name, ids[0]);
  return out;
}

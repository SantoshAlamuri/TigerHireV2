import type { SupabaseClient } from "@supabase/supabase-js";

const APP_COLUMNS =
  "id, candidate_id, job_id, status, created_at, notice_period_days, expected_ctc_lpa, offers_in_hand, candidates(id, name, location, experience_years), application_screening_answers(question_id, answer_yes, answer_text)";
const SCORE_COLUMNS =
  "id, candidate_id, overall_score, ideal_match_pct, market_percentile, market_label, criteria_breakdown, green_flags, amber_flags, red_flags, evidence_json, scoring_method, created_at";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function postgrestInList(ids: string[]): string | null {
  const safe = [...new Set(ids.filter((id) => UUID.test(id)))];
  return safe.length ? `(${safe.join(",")})` : null;
}

/**
 * Highest-scoring pending applications, bounded at the database before details load.
 * The next review batch is always this query again: decided rows leave `applied`,
 * so page 1 of remaining scores is the next queue. A score cursor would skip the
 * new first rows after a save.
 */
export async function loadReviewBatch(db: SupabaseClient, jobId: string, limit: number) {
  const [ranked, counted] = await Promise.all([
    db
      .from("fit_scores")
      .select(`${SCORE_COLUMNS}, candidates!inner(applications!inner(id))`)
      .eq("job_id", jobId)
      .eq("candidates.applications.job_id", jobId)
      .eq("candidates.applications.status", "applied")
      .or("is_test_run.eq.false,is_test_run.is.null")
      .is("superseded_at", null)
      .not("overall_score", "is", null)
      .order("overall_score", { ascending: false })
      .order("candidate_id", { ascending: true })
      .limit(limit),
    db
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId)
      .eq("status", "applied"),
  ]);
  if (ranked.error) throw ranked.error;
  if (counted.error) throw counted.error;
  if (counted.count == null) throw new Error("Review total unavailable");
  const scores = (ranked.data ?? []) as unknown as Array<
    Record<string, unknown> & { candidate_id: string }
  >;
  const byCandidate = new Map(
    scores.map(({ candidates: _join, ...score }) => [score.candidate_id, score]),
  );
  const rankedIds = [...byCandidate.keys()];
  const applications: Array<Record<string, unknown> & { candidate_id: string }> = [];
  if (rankedIds.length) {
    const matched = await db
      .from("applications")
      .select(APP_COLUMNS)
      .eq("job_id", jobId)
      .eq("status", "applied")
      .in("candidate_id", rankedIds)
      .limit(limit);
    if (matched.error) throw matched.error;
    applications.push(...(matched.data ?? []));
  }
  // When scored candidates do not fill the batch, include candidates awaiting a score.
  if (scores.length < limit && applications.length < limit) {
    let fallback = db
      .from("applications")
      .select(APP_COLUMNS)
      .eq("job_id", jobId)
      .eq("status", "applied")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(limit - applications.length);
    const exclude = postgrestInList(rankedIds);
    if (exclude) fallback = fallback.not("candidate_id", "in", exclude);
    const unscored = await fallback;
    if (unscored.error) throw unscored.error;
    applications.push(...(unscored.data ?? []));
  }
  const rank = new Map(rankedIds.map((id, index) => [id, index]));
  applications.sort(
    (a, b) => (rank.get(a.candidate_id) ?? limit) - (rank.get(b.candidate_id) ?? limit),
  );
  return {
    applications: applications.map((app) => ({
      ...app,
      fit_scores: byCandidate.get(app.candidate_id) ?? null,
    })),
    total: counted.count,
    nextCursor: undefined,
  };
}

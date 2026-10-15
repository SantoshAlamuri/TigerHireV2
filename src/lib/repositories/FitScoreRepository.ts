import type { SupabaseClient } from "@supabase/supabase-js";
import { maskCandidateForShortlist } from "@/lib/security/pii";

type FitScoreRow = Record<string, unknown> & {
  job_id: string;
  candidate_id: string;
  is_test_run?: boolean | null;
  overall_score?: number | null;
  created_at?: string | null;
};

const FIT_SCORE_WRITE_COLUMNS =
  "id, job_id, candidate_id, overall_score, is_test_run, created_at, updated_at";

function dedupeLatestScores(rows: FitScoreRow[]): FitScoreRow[] {
  // Keep the latest score per (job, candidate) pair to avoid showing historical duplicates.
  const sorted = [...rows].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });

  const seen = new Set<string>();
  const deduped: FitScoreRow[] = [];
  for (const row of sorted) {
    const key = `${row.job_id}:${row.candidate_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped;
}

export const FitScoreRepository = {
  async getById(supabase: SupabaseClient, id: string) {
    const { data, error } = await supabase
      .from("fit_scores")
      .select(
        "*, jobs(id, title, organisation_id, organisations!jobs_organisation_id_fkey(name)), candidates(id, name)",
      )
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  async listForJob(supabase: SupabaseClient, jobId: string, limit = 50) {
    // Select without verification_claims to avoid RLS/relationship issues
    // and make authenticity columns optional (may not exist in older DBs)
    // Filter out test runs at DB level to avoid fetching unnecessary rows
    const { data, error } = await supabase
      .from("fit_scores")
      .select(
        "*, jobs(id, title, organisation_id, organisations!jobs_organisation_id_fkey(name)), candidates(id, name, full_name, current_role, trust_score, ghost_risk_score, vouches(id, voucher_name, relationship_type, standout_sentence))",
      )
      .eq("job_id", jobId)
      .or("is_test_run.eq.false,is_test_run.is.null")
      .is("superseded_at", null)
      .order("overall_score", { ascending: false })
      .limit(limit);
    if (error) throw error;

    const scores = (data ?? []) as FitScoreRow[];

    // Fetch authenticity columns separately if they exist (graceful degradation)
    if (scores.length > 0) {
      try {
        const candidateIds = [
          ...new Set(
            scores
              .map(
                (s: Record<string, unknown>) =>
                  (s.candidates as Record<string, unknown> | null)?.id,
              )
              .filter(Boolean),
          ),
        ];
        if (candidateIds.length > 0) {
          const { data: candidatesData, error: authenticityError } = await supabase
            .from("candidates")
            .select("id, authenticity_signal, authenticity_confidence, authenticity_reasons")
            .in("id", candidateIds);

          // Only merge if query succeeded and columns exist
          if (!authenticityError && candidatesData) {
            const authenticityMap = new Map(
              candidatesData.map((c) => [
                c.id,
                {
                  authenticity_signal: c.authenticity_signal,
                  authenticity_confidence: c.authenticity_confidence,
                  authenticity_reasons: c.authenticity_reasons,
                },
              ]),
            );
            scores.forEach((score: Record<string, unknown>) => {
              const candidate = score.candidates as Record<string, unknown> | null;
              if (candidate?.id) {
                const authenticity = authenticityMap.get(candidate.id as string);
                if (authenticity) {
                  Object.assign(candidate, authenticity);
                }
              }
            });
          }
        }
      } catch {
        // Ignore errors fetching authenticity columns (columns may not exist in older DBs)
      }
    }

    return scores;
  },

  async listForJobReview(supabase: SupabaseClient, jobId: string, limit = 100) {
    const { data, error } = await supabase
      .from("fit_scores")
      .select(
        "id, job_id, candidate_id, overall_score, ideal_match_pct, market_percentile, market_label, criteria_breakdown, green_flags, amber_flags, red_flags, evidence_json, is_test_run, superseded_at, created_at",
      )
      .eq("job_id", jobId)
      .or("is_test_run.eq.false,is_test_run.is.null")
      .is("superseded_at", null)
      .order("overall_score", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return dedupeLatestScores((data ?? []) as FitScoreRow[]);
  },

  async listForCandidate(supabase: SupabaseClient, candidateId: string, limit = 50) {
    // Select without verification_claims to avoid RLS/relationship issues
    // and make authenticity columns optional (may not exist in older DBs)
    // Filter out test runs at DB level
    const { data, error } = await supabase
      .from("fit_scores")
      .select(
        "*, jobs(id, title, organisation_id, organisations!jobs_organisation_id_fkey(name)), candidates(id, name, full_name, current_role, trust_score, ghost_risk_score, vouches(id, voucher_name, relationship_type, standout_sentence))",
      )
      .eq("candidate_id", candidateId)
      .or("is_test_run.eq.false,is_test_run.is.null")
      .is("superseded_at", null)
      .order("overall_score", { ascending: false })
      .limit(limit);
    if (error) throw error;

    const scores = (data ?? []) as FitScoreRow[];

    // Fetch authenticity columns separately if they exist (graceful degradation)
    if (scores.length > 0) {
      try {
        const candidateIds = [
          ...new Set(
            scores
              .map(
                (s: Record<string, unknown>) =>
                  (s.candidates as Record<string, unknown> | null)?.id,
              )
              .filter(Boolean),
          ),
        ];
        if (candidateIds.length > 0) {
          const { data: candidatesData, error: authenticityError } = await supabase
            .from("candidates")
            .select("id, authenticity_signal, authenticity_confidence, authenticity_reasons")
            .in("id", candidateIds);

          // Only merge if query succeeded and columns exist
          if (!authenticityError && candidatesData) {
            const authenticityMap = new Map(
              candidatesData.map((c) => [
                c.id,
                {
                  authenticity_signal: c.authenticity_signal,
                  authenticity_confidence: c.authenticity_confidence,
                  authenticity_reasons: c.authenticity_reasons,
                },
              ]),
            );
            scores.forEach((score: Record<string, unknown>) => {
              const candidate = score.candidates as Record<string, unknown> | null;
              if (candidate?.id) {
                const authenticity = authenticityMap.get(candidate.id as string);
                if (authenticity) {
                  Object.assign(candidate, authenticity);
                }
              }
            });
          }
        }
      } catch {
        // Ignore errors fetching authenticity columns (columns may not exist in older DBs)
      }
    }

    return scores;
  },

  async listForOrg(supabase: SupabaseClient, jobIds: string[], limit = 100) {
    if (jobIds.length === 0) return [];
    // Filter out test runs at DB level
    const { data, error } = await supabase
      .from("fit_scores")
      .select(
        "*, jobs(id, title, organisation_id, organisations!jobs_organisation_id_fkey(name)), candidates(id, name, full_name, current_role, trust_score, ghost_risk_score, vouches(id, voucher_name, relationship_type, standout_sentence))",
      )
      .in("job_id", jobIds)
      .or("is_test_run.eq.false,is_test_run.is.null")
      .is("superseded_at", null)
      .order("overall_score", { ascending: false })
      .limit(limit);
    if (error) throw error;
    const scores = (data ?? []) as FitScoreRow[];

    // Fetch authenticity columns separately if they exist (graceful degradation)
    if (scores.length > 0) {
      try {
        const candidateIds = [
          ...new Set(
            scores
              .map(
                (s: Record<string, unknown>) =>
                  (s.candidates as Record<string, unknown> | null)?.id,
              )
              .filter(Boolean),
          ),
        ];
        if (candidateIds.length > 0) {
          const { data: candidatesData, error: authenticityError } = await supabase
            .from("candidates")
            .select("id, authenticity_signal, authenticity_confidence, authenticity_reasons")
            .in("id", candidateIds);

          if (!authenticityError && candidatesData) {
            const authenticityMap = new Map(
              candidatesData.map((c) => [
                c.id,
                {
                  authenticity_signal: c.authenticity_signal,
                  authenticity_confidence: c.authenticity_confidence,
                  authenticity_reasons: c.authenticity_reasons,
                },
              ]),
            );
            scores.forEach((score: Record<string, unknown>) => {
              const candidate = score.candidates as Record<string, unknown> | null;
              if (candidate?.id) {
                const authenticity = authenticityMap.get(candidate.id as string);
                if (authenticity) {
                  Object.assign(candidate, authenticity);
                }
              }
            });
          }
        }
      } catch {
        // Ignore errors fetching authenticity columns (columns may not exist in older DBs)
      }
    }

    return dedupeLatestScores(scores);
  },

  async getShortlistForJob(
    supabase: SupabaseClient,
    jobId: string,
    params: {
      minScore: number;
      page: number;
      limit: number;
      organisationId: string;
    },
  ) {
    const offset = (params.page - 1) * params.limit;

    const { data, error, count } = await supabase
      .from("fit_scores")
      .select(
        "*, candidates(id, name, full_name, current_role, skills, experience_years, location, intent_score, authenticity_signal, authenticity_confidence, authenticity_reasons)",
        { count: "exact" },
      )
      .eq("job_id", jobId)
      .or("is_test_run.eq.false,is_test_run.is.null")
      .is("superseded_at", null)
      .gte("overall_score", params.minScore)
      .order("overall_score", { ascending: false })
      .range(offset, offset + params.limit - 1);

    if (error) throw error;

    const pageRows = (data ?? []) as FitScoreRow[];
    const candidateIds = pageRows.map((s) => s.candidate_id as string);
    const { data: unlocks } = await supabase
      .from("candidate_unlocks")
      .select("candidate_id")
      .eq("organisation_id", params.organisationId)
      .in("candidate_id", candidateIds.length > 0 ? candidateIds : ["__none__"]);

    const unlockedSet = new Set(
      (unlocks ?? []).map((u: { candidate_id: string }) => u.candidate_id),
    );

    const shortlist = pageRows.map((score: Record<string, unknown>) => {
      const isUnlocked = unlockedSet.has(score.candidate_id as string);
      const candidate = score.candidates as Record<string, unknown> | null;
      return {
        ...score,
        candidates: candidate ? maskCandidateForShortlist(candidate, isUnlocked) : null,
        isUnlocked,
      };
    });

    return { shortlist, total: count ?? 0 };
  },

  async create(supabase: SupabaseClient, payload: Record<string, unknown>) {
    const { data, error } = await supabase
      .from("fit_scores")
      .insert(payload)
      .select(FIT_SCORE_WRITE_COLUMNS)
      .single();
    if (error) throw error;
    return data;
  },
};

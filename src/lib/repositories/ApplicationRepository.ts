import { loadReviewBatch } from "./review-batch";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ApplicationListParams {
  page: number;
  limit: number;
  cursor?: string;
  status?: string;
  jobId?: string;
  candidateId?: string;
  reviewOrder?: "score";
  search?: string;
  jobTitle?: string;
  location?: string;
  highIntentOnly?: boolean;
}

const APPLICATION_MUTATION_COLUMNS = `
  id, candidate_id, job_id, fit_score_id, interest, cover_note, status, viewed_at, created_at, updated_at,
  source, referral_link_id, direct_referrer_id, parent_referrer_id, current_ctc_lpa, expected_ctc_lpa,
  notice_period_days, offers_in_hand, available_from, relocation_willingness, app_close_reminder_7d_sent_at,
  app_close_reminder_24h_sent_at, stage_type, billing_ctc_required, offer_accepted_at, confidential_apply
`;

export const ApplicationRepository = {
  async getById(supabase: SupabaseClient, id: string) {
    const { data, error } = await supabase
      .from("applications")
      .select(
        "*, jobs(id, title, location, organisation_id, hiring_manager_id, hiring_request_id, organisations!jobs_organisation_id_fkey(name), hiring_requests!jobs_hiring_request_id_fkey(id, req_code, title, status, headcount)), candidates(id, user_id, name, phone, skills, experience_years, location, intent_score), fit_scores(overall_score, skills_score, experience_score, dimensions, summary)",
      )
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  async listForCandidate(
    supabase: SupabaseClient,
    candidateId: string,
    params: ApplicationListParams,
  ) {
    let query = supabase
      .from("applications")
      .select(
        "*, jobs(id, title, location, organisations!jobs_organisation_id_fkey(name)), fit_scores(overall_score)",
        {
          count: "exact",
        },
      )
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false });

    if (params.status) query = query.eq("status", params.status);

    if (params.cursor) {
      query = query.lt("created_at", params.cursor).limit(params.limit + 1);
    } else {
      const offset = (params.page - 1) * params.limit;
      query = query.range(offset, offset + params.limit - 1);
    }

    const { data, error, count } = await query;
    if (error) throw error;
    const list = data ?? [];
    let applications = list;
    let nextCursor: string | undefined;
    if (params.cursor && list.length > params.limit) {
      applications = list.slice(0, params.limit);
      const last = applications[applications.length - 1] as {
        created_at: string;
      };
      nextCursor = last.created_at;
    }
    return { applications, total: count ?? 0, nextCursor };
  },

  async listForRecruiter(supabase: SupabaseClient, params: ApplicationListParams) {
    let query = supabase
      .from("applications")
      .select(
        "*, jobs(id, title, created_at, organisation_id, organisations!jobs_organisation_id_fkey(name)), candidates(id, name, phone, skills, experience_years, location, intent_score), fit_scores(overall_score, primary_score, skills_score, experience_score, shadow_score, recruiter_selected, signal_score, grade_based_score, scoring_version, scoring_method, one_line_summary, ideal_match_pct, market_percentile, market_label, green_flags, amber_flags, red_flags, evidence_json), application_screening_answers(question_id, answer_yes, answer_text)"
          .replace("jobs(", params.jobTitle ? "jobs!inner(" : "jobs(")
          .replace(
            "candidates(",
            params.search || params.location || params.highIntentOnly
              ? "candidates!inner("
              : "candidates(",
          ),
        { count: "exact" },
      )
      .order("created_at", { ascending: false });

    if (params.status) query = query.eq("status", params.status);
    if (params.jobId) query = query.eq("job_id", params.jobId);
    if (params.candidateId) query = query.eq("candidate_id", params.candidateId);
    if (params.search)
      query = query.ilike("candidates.name", `%${params.search.replace(/[\\%_]/g, "\\$&")}%`);
    if (params.jobTitle) query = query.eq("jobs.title", params.jobTitle);
    if (params.location) query = query.eq("candidates.location", params.location);
    if (params.highIntentOnly) query = query.gte("candidates.intent_score", 60);

    if (params.cursor) {
      query = query.lt("created_at", params.cursor).limit(params.limit + 1);
    } else {
      const offset = (params.page - 1) * params.limit;
      query = query.range(offset, offset + params.limit - 1);
    }

    const { data, error, count } = await query;
    if (error) throw error;
    // Relation join modifiers are dynamic, so the SDK cannot infer the projection.
    const list = (data ?? []) as unknown as Array<Record<string, unknown> & { created_at: string }>;
    let applications = list;
    let nextCursor: string | undefined;
    if (params.cursor && list.length > params.limit) {
      applications = list.slice(0, params.limit);
      const last = applications[applications.length - 1] as {
        created_at: string;
      };
      nextCursor = last.created_at;
    }
    return { applications, total: count ?? 0, nextCursor };
  },

  async listForRecruiterReview(supabase: SupabaseClient, params: ApplicationListParams) {
    if (
      params.reviewOrder === "score" &&
      params.jobId &&
      params.status === "applied" &&
      !params.candidateId &&
      !params.cursor &&
      params.page === 1
    )
      return loadReviewBatch(supabase, params.jobId, params.limit);
    let query = supabase
      .from("applications")
      .select(
        "id, candidate_id, job_id, status, created_at, notice_period_days, expected_ctc_lpa, offers_in_hand, candidates(id, name, location, experience_years), application_screening_answers(question_id, answer_yes, answer_text)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false });

    if (params.status) query = query.eq("status", params.status);
    if (params.jobId) query = query.eq("job_id", params.jobId);
    if (params.candidateId) query = query.eq("candidate_id", params.candidateId);

    if (params.cursor) {
      query = query.lt("created_at", params.cursor).limit(params.limit + 1);
    } else {
      const offset = (params.page - 1) * params.limit;
      query = query.range(offset, offset + params.limit - 1);
    }

    const { data, error, count } = await query;
    if (error) throw error;
    const list = data ?? [];
    let applications = list;
    let nextCursor: string | undefined;
    if (params.cursor && list.length > params.limit) {
      applications = list.slice(0, params.limit);
      const last = applications[applications.length - 1] as {
        created_at: string;
      };
      nextCursor = last.created_at;
    }
    return { applications, total: count ?? 0, nextCursor };
  },

  async create(supabase: SupabaseClient, payload: Record<string, unknown>) {
    const { data, error } = await supabase
      .from("applications")
      .insert(payload)
      .select(APPLICATION_MUTATION_COLUMNS)
      .single();
    if (error) throw error;
    return data;
  },

  async updateStatus(supabase: SupabaseClient, id: string, payload: Record<string, unknown>) {
    const { data, error } = await supabase
      .from("applications")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(APPLICATION_MUTATION_COLUMNS)
      .single();
    if (error) throw error;
    return data;
  },

  async findExistingScore(supabase: SupabaseClient, candidateId: string, jobId: string) {
    const { data } = await supabase
      .from("fit_scores")
      .select("id")
      .eq("candidate_id", candidateId)
      .eq("job_id", jobId)
      .or("is_test_run.eq.false,is_test_run.is.null")
      .maybeSingle();
    return data?.id ?? null;
  },
};

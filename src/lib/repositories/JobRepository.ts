import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeSearchQuery } from "@/lib/security/search-sanitize";
import { env } from "@/lib/config/env";

export interface JobListParams {
  view?: "summary";
  organisationId?: string;
  /** When set, list jobs for any of these orgs (used by agency for client orgs). */
  organisationIds?: string[];
  hiringManagerId?: string;
  status?: string;
  search?: string;
  page: number;
  limit: number;
  cursor?: string;
  candidateView?: boolean;
}

export const JOB_LIST_SUMMARY_COLUMNS: string =
  "id, title, status, location, created_at, is_active, list_on_public_job_board, applications(count)";

export const JobRepository = {
  async getById(supabase: SupabaseClient, id: string) {
    const { data, error } = await supabase
      .from("jobs")
      .select(
        "*, organisations!jobs_organisation_id_fkey(name), hiring_requests!jobs_hiring_request_id_fkey(id, req_code, title, status, headcount)",
      )
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  async list(supabase: SupabaseClient, params: JobListParams) {
    let query = supabase
      .from("jobs")
      .select(
        params.view === "summary"
          ? JOB_LIST_SUMMARY_COLUMNS
          : "*, organisations!jobs_organisation_id_fkey(name), job_referral_config(direct_bonus_amount, bonus_currency), hiring_requests!jobs_hiring_request_id_fkey(urgency)",
        {
          count: "exact",
        },
      );

    if (params.organisationId) {
      query = query.eq("organisation_id", params.organisationId);
    }
    if (params.organisationIds && params.organisationIds.length > 0) {
      query = query.in("organisation_id", params.organisationIds);
    }
    if (params.hiringManagerId) {
      query = query.eq("hiring_manager_id", params.hiringManagerId);
    }
    if (params.candidateView) {
      query = query.eq("status", "open").eq("list_on_public_job_board", true);
      const hiddenOrgSlugs = env.hiddenPublicJobOrgSlugs;
      if (hiddenOrgSlugs.length > 0) {
        const { data: hiddenOrgs } = await supabase
          .from("organisations")
          .select("id")
          .in("slug", hiddenOrgSlugs);
        const hiddenOrgIds = (hiddenOrgs ?? []).map((o) => o.id as string).filter(Boolean);
        if (hiddenOrgIds.length > 0) {
          query = query.not("organisation_id", "in", `(${hiddenOrgIds.join(",")})`);
        }
      }
    } else if (params.status) {
      query = query.eq("status", params.status);
    }
    if (params.search) {
      const s = sanitizeSearchQuery(params.search);
      if (s) {
        query = query.or(`title.ilike.%${s}%,description.ilike.%${s}%,location.ilike.%${s}%`);
      }
    }

    query = query.order("created_at", { ascending: false });

    if (params.cursor) {
      query = query.lt("created_at", params.cursor).limit(params.limit + 1);
    } else {
      const offset = (params.page - 1) * params.limit;
      query = query.range(offset, offset + params.limit - 1);
    }

    const { data, error, count } = await query;
    if (error) throw error;
    // The selected projection is dynamic; both variants retain these identity fields.
    const list = (data ?? []) as unknown as Array<
      Record<string, unknown> & { id: string; created_at: string }
    >;
    let jobs = list;
    let nextCursor: string | undefined;
    if (params.cursor && list.length > params.limit) {
      jobs = list.slice(0, params.limit);
      const last = jobs[jobs.length - 1] as { created_at: string };
      nextCursor = last.created_at;
    }

    // Attach matched_count (fit_scores per job) for UI "X matched"
    const jobIds = (jobs as { id: string }[]).map((j) => j.id);
    if (jobIds.length > 0 && params.view !== "summary") {
      const { data: scoreRows } = await supabase
        .from("fit_scores")
        .select("job_id")
        .in("job_id", jobIds)
        .or("is_test_run.eq.false,is_test_run.is.null");
      const countByJob: Record<string, number> = {};
      for (const id of jobIds) countByJob[id] = 0;
      for (const row of scoreRows ?? []) {
        const jid = (row as { job_id: string }).job_id;
        if (jid) countByJob[jid] = (countByJob[jid] ?? 0) + 1;
      }
      jobs = jobs.map((j) => ({
        ...j,
        matched_count: countByJob[j.id] ?? 0,
      }));
    }

    return { jobs, total: count ?? 0, nextCursor };
  },

  async create(supabase: SupabaseClient, payload: Record<string, unknown>) {
    const { data, error } = await supabase
      .from("jobs")
      .insert(payload)
      .select(
        "id, organisation_id, created_by, hiring_manager_id, title, description, location, status, compensation_min, compensation_max, shortlist_due_at, shortlist_delivered_at, created_at, updated_at, assigned_recruiter_id, show_salary, role_function, seniority_level, skills_required, skills_preferred, remote_allowed, jd_sections, list_on_public_job_board, list_for_internal_referrals, applications_close_at, hiring_request_id",
      )
      .single();
    if (error) throw error;
    return data;
  },

  async update(supabase: SupabaseClient, id: string, payload: Record<string, unknown>) {
    const { data, error } = await supabase
      .from("jobs")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(
        "id, organisation_id, created_by, hiring_manager_id, title, description, location, status, compensation_min, compensation_max, shortlist_due_at, shortlist_delivered_at, created_at, updated_at, assigned_recruiter_id, show_salary, role_function, seniority_level, skills_required, skills_preferred, remote_allowed, jd_sections, list_on_public_job_board, list_for_internal_referrals, applications_close_at, hiring_request_id",
      )
      .single();
    if (error) throw error;
    return data;
  },

  async remove(supabase: SupabaseClient, id: string) {
    const { error } = await supabase.from("jobs").delete().eq("id", id);
    if (error) throw error;
  },

  async getActiveByCompany(supabase: SupabaseClient, organisationId: string) {
    const { data, error } = await supabase
      .from("jobs")
      .select(
        "id, title, location, seniority_level, status, list_on_public_job_board, list_for_internal_referrals",
      )
      .eq("organisation_id", organisationId)
      .eq("status", "open")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async getJobIds(
    supabase: SupabaseClient,
    filter: { organisationId?: string; hiringManagerId?: string },
  ) {
    let query = supabase.from("jobs").select("id");
    if (filter.organisationId) query = query.eq("organisation_id", filter.organisationId);
    if (filter.hiringManagerId) query = query.eq("hiring_manager_id", filter.hiringManagerId);
    const { data } = await query;
    return (data ?? []).map((j: { id: string }) => j.id);
  },

  async markShortlistDelivered(supabase: SupabaseClient, jobId: string) {
    await supabase
      .from("jobs")
      .update({
        shortlist_delivered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  },
};

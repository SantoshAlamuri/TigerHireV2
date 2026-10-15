import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeLocationQuery, sanitizeSearchQuery } from "@/lib/security/search-sanitize";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export interface CandidateListParams {
  search?: string;
  skills?: string;
  location?: string;
  minIntentScore?: number;
  minExperience?: number;
  maxExperience?: number;
  jobId?: string;
  roleFunction?: string;
  page: number;
  limit: number;
  cursor?: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
  /** When set, query tenant scope directly from org access rules via RPC. */
  accessibleOrganisationIds?: string[] | null;
  /** When set, only return candidates whose id is in this set (multi-tenant strict). */
  allowedCandidateIds?: string[] | null;
}

const CANDIDATE_AUTH_LOOKUP_COLUMNS = "id, user_id, name, email";
const CANDIDATE_RECORD_COLUMNS = `
  id, user_id, name, full_name, email, phone, resume_url, cv_url, cv_raw_text, cv_parsed_at,
  skills, experience_years, location, intent_score, profile_embedding, visibility, signal_sources,
  trust_score, ghost_risk_score, entry_path, availability, seniority_level, current_role,
  current_company, salary_expectation_min, salary_expectation_max, referred_by, linkedin_url,
  portfolio_url, github_url, employment_status, employer_company_id, resignation_declared_at,
  profile_unlocked_at, processing_status, erased_at, last_active_at, authenticity_signal,
  authenticity_confidence, authenticity_reasons, authenticity_score, authenticity_flags, created_at, updated_at
`;

type BooleanSearchGroup = string[];

function hasBooleanOperators(search: string): boolean {
  return /\b(?:AND|OR)\b|"/i.test(search);
}

function parseBooleanSearch(search: string): BooleanSearchGroup[] {
  const cleaned = search.trim();
  if (!cleaned) return [];
  const parts = cleaned
    .split(/\s+OR\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.map((part) => {
    const andParts = part
      .split(/\s+AND\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);
    const tokens = andParts.flatMap((chunk) => {
      const matches = chunk.match(/"[^"]+"|[^\s]+/g) ?? [];
      return matches.map((m) => m.replace(/^"|"$/g, "").trim().toLowerCase()).filter(Boolean);
    });
    return tokens;
  });
}

function candidateSearchHaystack(row: Record<string, unknown>): string {
  const fields = [
    row.name,
    row.full_name,
    row.email,
    row.location,
    row.current_role,
    row.current_company,
    ...(Array.isArray(row.skills) ? row.skills : []),
  ];
  return fields
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesBooleanQuery(row: Record<string, unknown>, groups: BooleanSearchGroup[]): boolean {
  if (groups.length === 0) return true;
  const haystack = candidateSearchHaystack(row);
  return groups.some((group) => group.every((term) => haystack.includes(term)));
}

/** Candidate IDs that have a FitScore for the given job or for jobs with role_function (tenant-scoped when orgs provided). */
async function fetchCandidateIdsForJobScope(
  supabase: SupabaseClient,
  jobId: string | undefined,
  roleFunction: string | undefined,
  organisationIds: string[] | undefined,
): Promise<string[]> {
  if (jobId) {
    if (organisationIds?.length) {
      const { data: jobRow, error: jobErr } = await supabase
        .from("jobs")
        .select("organisation_id")
        .eq("id", jobId)
        .maybeSingle();
      if (jobErr) throw jobErr;
      const orgId = jobRow?.organisation_id as string | undefined;
      if (!orgId || !organisationIds.includes(orgId)) return [];
    }

    const { data, error } = await supabase
      .from("fit_scores")
      .select("candidate_id")
      .eq("job_id", jobId)
      .or("is_test_run.eq.false,is_test_run.is.null");
    if (error) throw error;
    return [
      ...new Set((data ?? []).map((r: { candidate_id: string }) => r.candidate_id).filter(Boolean)),
    ];
  }

  const rf = roleFunction?.trim();
  if (!rf) return [];

  let jq = supabase.from("jobs").select("id").ilike("role_function", rf);
  if (organisationIds?.length) {
    jq = jq.in("organisation_id", organisationIds);
  }
  const { data: jobs, error: je } = await jq;
  if (je) throw je;
  const jobIds = (jobs ?? []).map((j: { id: string }) => j.id);
  if (jobIds.length === 0) return [];

  const { data: scores, error: se } = await supabase
    .from("fit_scores")
    .select("candidate_id")
    .in("job_id", jobIds)
    .or("is_test_run.eq.false,is_test_run.is.null");
  if (se) throw se;
  return [
    ...new Set((scores ?? []).map((r: { candidate_id: string }) => r.candidate_id).filter(Boolean)),
  ];
}

/**
 * Narrow allowed IDs by job / role_function fit-score scope (for RPC fallback and super_admin paths).
 * Clears accessibleOrganisationIds so listing uses explicit .in(id) instead of RPC.
 */
async function intersectJobScopeWithAllowed(
  supabase: SupabaseClient,
  params: CandidateListParams,
): Promise<CandidateListParams> {
  if (!params.jobId && !params.roleFunction?.trim()) return params;

  const scoped = await fetchCandidateIdsForJobScope(
    supabase,
    params.jobId,
    params.roleFunction,
    params.accessibleOrganisationIds ?? undefined,
  );

  if (scoped.length === 0) {
    return { ...params, allowedCandidateIds: [], accessibleOrganisationIds: undefined };
  }

  const scopedSet = new Set(scoped);
  if (params.allowedCandidateIds != null) {
    const narrowed = params.allowedCandidateIds.filter((id) => scopedSet.has(id));
    return {
      ...params,
      allowedCandidateIds: narrowed,
      accessibleOrganisationIds: undefined,
    };
  }

  return {
    ...params,
    allowedCandidateIds: scoped,
    accessibleOrganisationIds: undefined,
  };
}

function omitJobScopeFields(params: CandidateListParams): CandidateListParams {
  const { jobId: _jobId, roleFunction: _roleFunction, ...rest } = params;
  return rest;
}

/** Max candidate IDs to apply for tenant filter (avoids huge .in() clauses). */
const MAX_ACCESSIBLE_IDS = 5000;

/** Use RPC when org list is large (better performance, single round-trip). */
const USE_RPC_ORG_THRESHOLD = 50;

/**
 * Returns candidate IDs that the given organisations can access (unlock or fit_score for their jobs).
 * Uses DB RPC when org list is large for scalability; otherwise client queries.
 */
export async function getAccessibleCandidateIdsForOrgs(
  supabase: SupabaseClient,
  organisationIds: string[],
): Promise<string[]> {
  if (organisationIds.length === 0) return [];

  if (organisationIds.length >= USE_RPC_ORG_THRESHOLD) {
    // get_accessible_candidate_ids is SECURITY DEFINER (bypasses RLS) and trusts
    // p_organisation_ids, so EXECUTE is revoked from anon/authenticated to block
    // direct /rest/v1/rpc cross-org enumeration. Call it via the service role.
    // organisationIds here is already server-derived from the caller's auth ctx.
    const admin = createSupabaseAdmin();
    const { data, error } = await admin.rpc("get_accessible_candidate_ids", {
      p_organisation_ids: organisationIds,
    });
    if (!error) {
      const arr = (data ?? []) as string[];
      return arr.length > MAX_ACCESSIBLE_IDS ? arr.slice(0, MAX_ACCESSIBLE_IDS) : arr;
    }
    // RPC may not exist before migration 74; fall back to client queries
  }

  const [unlocksRes, jobsRes] = await Promise.all([
    supabase
      .from("candidate_unlocks")
      .select("candidate_id")
      .in("organisation_id", organisationIds),
    supabase.from("jobs").select("id").in("organisation_id", organisationIds),
  ]);

  const jobIds = (jobsRes.data ?? []).map((r: { id: string }) => r.id);
  let scoresRes: { data: { candidate_id: string }[] | null } = { data: [] };
  if (jobIds.length > 0) {
    scoresRes = await supabase
      .from("fit_scores")
      .select("candidate_id")
      .in("job_id", jobIds)
      .or("is_test_run.eq.false,is_test_run.is.null");
  }

  const ids = new Set<string>();
  for (const row of unlocksRes.data ?? []) {
    const id = (row as { candidate_id: string }).candidate_id;
    if (id) ids.add(id);
  }
  for (const row of scoresRes.data ?? []) {
    const id = (row as { candidate_id: string }).candidate_id;
    if (id) ids.add(id);
  }

  const arr = Array.from(ids);
  return arr.length > MAX_ACCESSIBLE_IDS ? arr.slice(0, MAX_ACCESSIBLE_IDS) : arr;
}

async function listWithAllowedIds(supabase: SupabaseClient, params: CandidateListParams) {
  let query = supabase.from("candidates").select("*", { count: "exact" }).eq("visibility", true);

  if (params.allowedCandidateIds !== undefined) {
    if (params.allowedCandidateIds === null || params.allowedCandidateIds.length === 0) {
      return { candidates: [], total: 0, nextCursor: undefined };
    }
    query = query.in("id", params.allowedCandidateIds);
  }

  const booleanQueryGroups =
    params.search && hasBooleanOperators(params.search) ? parseBooleanSearch(params.search) : null;
  if (params.search && !booleanQueryGroups) {
    const s = sanitizeSearchQuery(params.search);
    if (s) {
      query = query.or(`name.ilike.%${s}%,email.ilike.%${s}%,location.ilike.%${s}%`);
    }
  }
  if (params.skills) {
    const skillList = params.skills.split(",").map((s) => s.trim());
    query = query.overlaps("skills", skillList);
  }
  if (params.location) {
    const loc = sanitizeLocationQuery(params.location);
    if (loc) query = query.ilike("location", `%${loc}%`);
  }
  if (params.minIntentScore !== undefined) query = query.gte("intent_score", params.minIntentScore);
  if (params.minExperience !== undefined)
    query = query.gte("experience_years", params.minExperience);
  if (params.maxExperience !== undefined)
    query = query.lte("experience_years", params.maxExperience);

  const orderAsc = params.sortOrder === "asc";
  query = query.order(params.sortBy, { ascending: orderAsc });

  if (booleanQueryGroups) {
    // Boolean search is evaluated in-memory to support AND/OR + quoted phrases across multiple fields.
    // Keep this bounded to avoid scanning the full table in one request.
    const { data, error } = await query.range(0, 999);
    if (error) throw error;
    const filtered = ((data ?? []) as Record<string, unknown>[]).filter((row) =>
      matchesBooleanQuery(row, booleanQueryGroups),
    );
    const start = (params.page - 1) * params.limit;
    const end = start + params.limit;
    const pageRows = filtered.slice(start, end);
    const hasMore = filtered.length > end;
    const last = pageRows[pageRows.length - 1] as { id: string } | undefined;
    return {
      candidates: pageRows,
      total: filtered.length,
      nextCursor: hasMore && last ? last.id : undefined,
    };
  }

  if (params.cursor) {
    query = orderAsc ? query.gt("id", params.cursor) : query.lt("id", params.cursor);
    query = query.limit(params.limit + 1);
  } else {
    const offset = (params.page - 1) * params.limit;
    query = query.range(offset, offset + params.limit - 1);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  const list = data ?? [];
  const hasMore = list.length > params.limit;
  const candidates = hasMore ? list.slice(0, params.limit) : list;
  const last = candidates[candidates.length - 1] as { id: string } | undefined;
  const nextCursor = hasMore && last ? last.id : undefined;
  return {
    candidates,
    total: count ?? 0,
    nextCursor,
  };
}

async function listByAccessibleOrganisations(
  supabase: SupabaseClient,
  params: CandidateListParams,
) {
  const organisationIds = params.accessibleOrganisationIds ?? [];
  if (organisationIds.length === 0) {
    return { candidates: [], total: 0, nextCursor: undefined };
  }

  const skillList = params.skills
    ?.split(",")
    .map((skill) => skill.trim())
    .filter(Boolean);
  const sanitizedSearch = params.search ? sanitizeSearchQuery(params.search) : undefined;
  const sanitizedLocation = params.location ? sanitizeLocationQuery(params.location) : undefined;
  const limit = params.limit;

  // list_accessible_candidate_ids_page is SECURITY DEFINER (bypasses RLS) and
  // trusts p_organisation_ids; EXECUTE is revoked from anon/authenticated to
  // block direct /rest/v1/rpc cross-org enumeration. Call via the service role.
  // organisationIds is already server-derived from the caller's auth context;
  // the candidate rows themselves are still fetched below via the user client.
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.rpc("list_accessible_candidate_ids_page", {
    p_organisation_ids: organisationIds,
    p_search: sanitizedSearch || null,
    p_skills: skillList && skillList.length > 0 ? skillList : null,
    p_location: sanitizedLocation || null,
    p_min_intent_score: params.minIntentScore ?? null,
    p_min_experience: params.minExperience ?? null,
    p_max_experience: params.maxExperience ?? null,
    p_sort_by: params.sortBy,
    p_sort_order: params.sortOrder,
    p_limit: limit,
    p_page: params.page,
    p_cursor: params.cursor ?? null,
    p_job_id: params.jobId ?? null,
    p_role_function: params.roleFunction?.trim() || null,
  });

  if (error) throw error;

  const rows = (data ?? []) as Array<{ id: string; total_count: number | string | null }>;
  const hasMore = params.cursor ? rows.length > limit : false;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const pageIds = pageRows.map((row) => row.id);

  if (pageIds.length === 0) {
    return { candidates: [], total: 0, nextCursor: undefined };
  }

  const { data: candidateRows, error: candidateError } = await supabase
    .from("candidates")
    .select(CANDIDATE_RECORD_COLUMNS)
    .in("id", pageIds);
  if (candidateError) throw candidateError;

  const candidateById = new Map(
    ((candidateRows ?? []) as Array<{ id: string }>).map((candidate) => [candidate.id, candidate]),
  );
  const candidates = pageIds.flatMap((id) => {
    const candidate = candidateById.get(id);
    return candidate ? [candidate as Record<string, unknown>] : [];
  });

  const last = candidates[candidates.length - 1] as { id: string } | undefined;
  const nextCursor = hasMore && last ? last.id : undefined;
  const firstTotal = pageRows[0]?.total_count;

  return {
    candidates,
    total: typeof firstTotal === "string" ? Number(firstTotal) : (firstTotal ?? 0),
    nextCursor,
  };
}

export const CandidateRepository = {
  async getById(supabase: SupabaseClient, id: string) {
    const { data, error } = await supabase
      .from("candidates")
      .select(CANDIDATE_RECORD_COLUMNS)
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  async getByUserId(supabase: SupabaseClient, userId: string) {
    const { data } = await supabase
      .from("candidates")
      .select(CANDIDATE_AUTH_LOOKUP_COLUMNS)
      .eq("user_id", userId)
      .single();
    return data;
  },

  async list(supabase: SupabaseClient, params: CandidateListParams) {
    if (params.accessibleOrganisationIds !== undefined) {
      try {
        return await listByAccessibleOrganisations(supabase, params);
      } catch {
        const allowedCandidateIds = await getAccessibleCandidateIdsForOrgs(
          supabase,
          params.accessibleOrganisationIds ?? [],
        );
        const merged = await intersectJobScopeWithAllowed(supabase, {
          ...params,
          allowedCandidateIds,
        });
        return await listWithAllowedIds(supabase, omitJobScopeFields(merged));
      }
    }

    const merged = await intersectJobScopeWithAllowed(supabase, params);
    return await listWithAllowedIds(supabase, omitJobScopeFields(merged));
  },

  async create(supabase: SupabaseClient, payload: Record<string, unknown>) {
    const { data, error } = await supabase
      .from("candidates")
      .insert(payload)
      .select(CANDIDATE_RECORD_COLUMNS)
      .single();
    if (error) throw error;
    return data;
  },

  async update(supabase: SupabaseClient, id: string, payload: Record<string, unknown>) {
    const { data, error } = await supabase
      .from("candidates")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(CANDIDATE_RECORD_COLUMNS)
      .single();
    if (error) throw error;
    return data;
  },

  async upsertByPhone(supabase: SupabaseClient, phone: string, payload: Record<string, unknown>) {
    const { data, error } = await supabase
      .from("candidates")
      .upsert({ phone, ...payload }, { onConflict: "phone" })
      .select("id")
      .single();
    if (error) throw error;
    return data;
  },

  async setProcessingStatus(supabase: SupabaseClient, id: string, status: string) {
    await supabase.from("candidates").update({ processing_status: status }).eq("id", id);
  },

  async eraseCandidate(supabase: SupabaseClient, id: string, opts: { clearCvUrls?: boolean } = {}) {
    const { error } = await supabase
      .from("candidates")
      .update({
        phone: null,
        email: null,
        name: "[ERASED]",
        full_name: "[ERASED]",
        cv_raw_text: null,
        cv_parsed_at: null,
        // Only cleared when the storage objects were verifiably removed — nulling
        // the pointers after a failed delete would orphan the file permanently.
        ...(opts.clearCvUrls ? { resume_url: null, cv_url: null } : {}),
        linkedin_url: null,
        profile_embedding: null,
        github_url: null,
        portfolio_url: null,
        erased_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw new Error("Could not erase candidate profile");
  },
};

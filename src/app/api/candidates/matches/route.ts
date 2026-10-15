import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";
import { sanitizeSearchQuery } from "@/lib/security/search-sanitize";
import { claimUnclaimedCandidateByEmail } from "@/lib/agents/candidate-dedup";

/** Job columns embedded on fit_scores for candidate browse cards (mapDbJobToPosting). */
const MATCHES_JOB_SELECT_BROWSE = [
  "id",
  "title",
  "description",
  "location",
  "organisation_id",
  "status",
  "compensation_min",
  "compensation_max",
  "skills_required",
  "skills_preferred",
  "remote_allowed",
  "role_function",
  "seniority_level",
  "created_at",
  "updated_at",
  "jd_sections",
  "organisations!jobs_organisation_id_fkey(name)",
  "job_referral_config(direct_bonus_amount, bonus_currency)",
].join(",");

async function attachMatchedCounts(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  matches: Record<string, unknown>[] | null | undefined,
) {
  const jobIds = [
    ...new Set(
      (matches ?? [])
        .map((m) => (m as { job_id?: string }).job_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  if (jobIds.length === 0) return matches ?? [];

  const { data: scoreRows } = await supabase
    .from("fit_scores")
    .select("job_id")
    .in("job_id", jobIds)
    .is("superseded_at", null)
    .or("is_test_run.eq.false,is_test_run.is.null");

  const countByJob: Record<string, number> = {};
  for (const id of jobIds) countByJob[id] = 0;
  for (const row of scoreRows ?? []) {
    const jid = (row as { job_id: string }).job_id;
    if (jid) countByJob[jid] = (countByJob[jid] ?? 0) + 1;
  }

  return (matches ?? []).map((m) => {
    const jid = (m as { job_id?: string }).job_id;
    const jobs = (m as { jobs?: Record<string, unknown> }).jobs;
    if (!jobs || typeof jobs !== "object") return m;
    return {
      ...m,
      jobs: {
        ...jobs,
        matched_count: jid ? (countByJob[jid] ?? 0) : 0,
      },
    };
  });
}

/**
 * GET /api/candidates/matches — candidate's own match feed (jobs scored against their profile)
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    if (!hasRole(ctx, "candidate_pro", "candidate_free")) {
      return jsonError("Forbidden", 403);
    }

    const supabase = await createSupabaseServerClient();

    // Find candidate record linked to this user (or claim unclaimed by email)
    let candidate = await supabase
      .from("candidates")
      .select("id")
      .eq("user_id", ctx.userId)
      .single()
      .then((r) => r.data);

    if (!candidate) {
      const admin = createSupabaseAdmin();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      await claimUnclaimedCandidateByEmail(admin, ctx.userId, authUser?.email);
      candidate = await supabase
        .from("candidates")
        .select("id")
        .eq("user_id", ctx.userId)
        .single()
        .then((r) => r.data);
    }

    if (!candidate) {
      return jsonSuccess({
        matches: [],
        message: "No candidate profile found. Complete your profile to see matches.",
      });
    }

    const { searchParams } = request.nextUrl;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 50);
    const page = Math.max(parseInt(searchParams.get("page") ?? "1", 10), 1);
    const offset = (page - 1) * limit;
    const openOnly =
      searchParams.get("open_only") === "1" || searchParams.get("open_only") === "true";
    const searchForBrowse = openOnly ? sanitizeSearchQuery(searchParams.get("search") ?? "") : "";

    let query = openOnly
      ? supabase
          .from("fit_scores")
          .select(`*, jobs!inner(${MATCHES_JOB_SELECT_BROWSE})`, { count: "exact" })
          .eq("candidate_id", candidate.id)
          .is("superseded_at", null)
          .eq("jobs.status", "open")
          .or("is_test_run.eq.false,is_test_run.is.null")
          .order("overall_score", { ascending: false })
      : supabase
          .from("fit_scores")
          .select(
            "*, jobs(id, title, description, location, compensation_min, compensation_max, organisations!jobs_organisation_id_fkey(name))",
            { count: "exact" },
          )
          .eq("candidate_id", candidate.id)
          .is("superseded_at", null)
          .or("is_test_run.eq.false,is_test_run.is.null")
          .order("overall_score", { ascending: false });

    if (openOnly) {
      const hiddenOrgSlugs = env.hiddenPublicJobOrgSlugs;
      if (hiddenOrgSlugs.length > 0) {
        const { data: hiddenOrgs } = await supabase
          .from("organisations")
          .select("id")
          .in("slug", hiddenOrgSlugs);
        const hiddenOrgIds = (hiddenOrgs ?? []).map((o) => o.id as string).filter(Boolean);
        if (hiddenOrgIds.length > 0) {
          query = query.not("jobs.organisation_id", "in", `(${hiddenOrgIds.join(",")})`);
        }
      }
      if (searchForBrowse) {
        const pattern = `%${searchForBrowse}%`;
        query = query.or(
          `title.ilike.${pattern},description.ilike.${pattern},location.ilike.${pattern}`,
          { referencedTable: "jobs" },
        );
      }
    }

    // Free tier: only show top 3
    if (hasRole(ctx, "candidate_free")) {
      query = query.range(0, 2);
    } else {
      query = query.range(offset, offset + limit - 1);
    }

    const { data: matches, error, count } = await query;

    if (error) {
      logger.error("Matches query failed", { error: String(error) });
      return jsonError("Failed to fetch matches", 500);
    }

    const withPool =
      openOnly && (matches?.length ?? 0) > 0
        ? await attachMatchedCounts(supabase, matches as Record<string, unknown>[])
        : matches;

    // For free tier, mask some data
    const processedMatches = withPool?.map((m) => {
      if (hasRole(ctx, "candidate_free")) {
        return {
          id: m.id,
          overall_score: m.overall_score,
          job_id: m.job_id,
          jobs: m.jobs
            ? {
                ...(m.jobs as Record<string, unknown>),
                compensation_min: null,
                compensation_max: null,
              }
            : null,
        };
      }
      return m;
    });

    return jsonSuccess({
      matches: processedMatches,
      pagination: hasRole(ctx, "candidate_free")
        ? { page: 1, limit: 3, total: count ?? 0, totalPages: 1 }
        : {
            page,
            limit,
            total: count ?? 0,
            totalPages: Math.ceil((count ?? 0) / limit) || 1,
          },
      tier: ctx.role,
      open_only: openOnly,
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch matches", {
      route: "GET /api/candidates/matches",
    });
  }
}

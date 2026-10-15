import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateCandidateSchema } from "@/lib/validations/candidates";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleZodError,
  handleApiError,
} from "@/lib/api-helpers";
import { ForbiddenError } from "@/lib/security/tenancy";
import { assertCandidateReachable } from "@/lib/security/candidate-scope";
import { validateOrigin } from "@/lib/security/csrf";
import { logger } from "@/lib/observability/logger";
import { mergeCandidateContactFallbacks } from "@/lib/candidates/merge-candidate-contact-fallbacks";
import { resolveCandidateScreeningFlag } from "@/lib/screening/candidate-flag";
import { listHiringManagerJobIds } from "@/lib/jobs/hiring-manager-job-ids";
import {
  maybeSelfHealCandidateParse,
  type SelfHealCandidateRow,
} from "@/lib/candidates/self-heal-parse";

const CANDIDATE_SELECT_COLUMNS = `
  id, user_id, name, full_name, email, phone, resume_url, cv_url, cv_raw_text, cv_parsed_at,
  skills, experience_years, location, intent_score, profile_embedding, visibility, signal_sources,
  trust_score, ghost_risk_score, entry_path, availability, seniority_level, current_role,
  current_company, salary_expectation_min, salary_expectation_max, referred_by, linkedin_url,
  portfolio_url, github_url, employment_status, employer_company_id, resignation_declared_at,
  profile_unlocked_at, processing_status, erased_at, last_active_at, authenticity_signal,
  authenticity_confidence, authenticity_reasons, authenticity_score, authenticity_flags, created_at, updated_at
`;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const { id } = await params;
    const supabase = await createSupabaseServerClient();

    const { data: candidate, error } = await supabase
      .from("candidates")
      .select(CANDIDATE_SELECT_COLUMNS)
      .eq("id", id)
      .single();

    if (error || !candidate) return jsonError("Candidate not found", 404);

    // Candidates can view their own full profile only
    const isSelf =
      hasRole(ctx, "candidate_pro", "candidate_free") && candidate.user_id === ctx.userId;
    if (hasRole(ctx, "candidate_pro", "candidate_free") && !isSelf) {
      return jsonError("Forbidden", 403);
    }

    // Full profile for callers that prove access (fit score, pipeline, or prior
    // unlock). Unlock credits are no longer required to view contact details.
    const isUnlocked = true;
    let accessibleOrganisationIds: string[] | null = null;

    // One resolver for every candidate surface — see @/lib/security/candidate-scope.
    // Hiring-manager job scoping and agency-delegation scoping both live there,
    // so this route cannot drift from the list, resume, and agent paths again.
    if (!hasRole(ctx, "super_admin") && !isSelf) {
      try {
        const access = await assertCandidateReachable(supabase, ctx, id);
        accessibleOrganisationIds = access.organisationIds;
      } catch (e) {
        if (e instanceof ForbiddenError) {
          return jsonError("Forbidden", 403);
        }
        throw e;
      }
    }

    const { data: latestScreening } = await (() => {
      let query = supabase
        .from("screening_jobs")
        .select("status, mode, updated_at, created_at")
        .eq("candidate_id", id)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(1);
      if (accessibleOrganisationIds && accessibleOrganisationIds.length > 0) {
        query = query.in("organisation_id", accessibleOrganisationIds);
      }
      return query;
    })();

    const screeningStatus =
      (latestScreening?.[0] as { status?: string | null } | undefined)?.status ?? null;
    const screeningMode =
      (latestScreening?.[0] as { mode?: string | null } | undefined)?.mode ?? null;
    const screeningUpdatedAt =
      (
        latestScreening?.[0] as
          | { updated_at?: string | null; created_at?: string | null }
          | undefined
      )?.updated_at ??
      (
        latestScreening?.[0] as
          | { updated_at?: string | null; created_at?: string | null }
          | undefined
      )?.created_at ??
      null;

    const enriched = await mergeCandidateContactFallbacks({
      ...(candidate as Record<string, unknown>),
      screening_flag: resolveCandidateScreeningFlag(screeningStatus),
      screening_status: screeningStatus,
      screening_mode: screeningMode,
      screening_updated_at: screeningUpdatedAt,
    });
    // A stored CV that never became a profile is re-read the moment someone
    // looks at it — no button to find, nothing to explain to the recruiter.
    const selfHeal = await maybeSelfHealCandidateParse(candidate as SelfHealCandidateRow);
    if (selfHeal.queued) {
      (enriched as Record<string, unknown>).processing_status = "processing";
    }
    return jsonSuccess({ candidate: enriched, isUnlocked });
  } catch (err) {
    return handleApiError(err, "Failed to fetch candidate", {
      route: "GET /api/candidates/[id]",
    });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const { id } = await params;
    const parsedBody = await parseJsonBody(request, "PATCH /api/candidates/[id]");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = updateCandidateSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const supabase = await createSupabaseServerClient();

    // Only the candidate themselves or super_admin can update
    const { data: existing } = await supabase
      .from("candidates")
      .select("user_id")
      .eq("id", id)
      .single();

    if (!existing) return jsonError("Candidate not found", 404);

    if (!hasRole(ctx, "super_admin") && existing.user_id !== ctx.userId) {
      return jsonError("Forbidden", 403);
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.email !== undefined) updateData.email = parsed.data.email;
    if (parsed.data.phone !== undefined) updateData.phone = parsed.data.phone;
    if (parsed.data.skills !== undefined) updateData.skills = parsed.data.skills;
    if (parsed.data.experienceYears !== undefined)
      updateData.experience_years = parsed.data.experienceYears;
    if (parsed.data.location !== undefined) updateData.location = parsed.data.location;
    if (parsed.data.visibility !== undefined) updateData.visibility = parsed.data.visibility;

    const { data: updated, error } = await supabase
      .from("candidates")
      .update(updateData)
      .eq("id", id)
      .select(CANDIDATE_SELECT_COLUMNS)
      .single();

    if (error) {
      logger.error("Candidate update failed", { error: String(error) });
      return jsonError("Failed to update candidate", 500);
    }

    return jsonSuccess({ candidate: updated });
  } catch (err) {
    return handleApiError(err, "Failed to update candidate", {
      route: "PATCH /api/candidates/[id]",
    });
  }
}

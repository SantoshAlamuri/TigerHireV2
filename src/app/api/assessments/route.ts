import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
  handleZodError,
} from "@/lib/api-helpers";
import { hasAnyEnterpriseRole } from "@/lib/security/enterprise-roles";
import { createAssessmentSchema } from "@/lib/validations/assessments";
import { createNotification } from "@/lib/services/notifications";
import { getOrgSettingsPermissions, hasSettingsCapability } from "@/lib/settings/permissions";
import { logger } from "@/lib/observability/logger";
import { validateOrigin } from "@/lib/security/csrf";
import {
  createAssessmentShareToken,
  getAssessmentShareUrl,
  sendAssessmentShareMessages,
} from "@/lib/services/assessment-share";
import { isMissingTableError } from "@/lib/settings/error-utils";
import { buildJobAssessmentsHref } from "@/lib/assessments/job-assessments-href";
import type { SupabaseClient } from "@supabase/supabase-js";

const ASSESSMENT_SELECT_FIELDS =
  "id, application_id, stage_id, organisation_id, type, title, instructions, deadline_at, reviewer_id, pass_threshold_pct, auto_advance, external_platform, webhook_url, created_by, status, share_token, submission_text, submission_url, submitted_at, score, max_score, feedback, scored_at, created_at, updated_at";

async function applicationIdsForJob(
  supabase: SupabaseClient,
  organisationId: string,
  jobId: string,
): Promise<{ ids: string[] } | { error: Response }> {
  const { data: apps, error } = await supabase
    .from("applications")
    .select("id, jobs!inner(organisation_id)")
    .eq("job_id", jobId)
    .eq("jobs.organisation_id", organisationId);
  if (error) {
    const fallback = handleAssessmentReadError(
      error,
      "GET /api/assessments",
      "Applications are not available in this environment yet.",
    );
    if (fallback) return { error: fallback };
    return { error: jsonError("Failed to load applications for job", 500) };
  }
  return { ids: (apps ?? []).map((row) => row.id as string) };
}

async function assertStageBelongsToJob(
  supabase: SupabaseClient,
  stageId: string,
  jobId: string,
): Promise<boolean> {
  const { data: stage } = await supabase
    .from("pipeline_stages")
    .select("job_id")
    .eq("id", stageId)
    .maybeSingle();
  return stage?.job_id === jobId;
}

function handleAssessmentReadError(
  error: unknown,
  route: string,
  fallbackMessage: string,
): Response | null {
  if (!isMissingTableError(error)) return null;
  logger.warn("Missing assessment-related table; returning empty list", {
    route,
    error: String(error),
  });
  return jsonSuccess({
    assessments: [],
    warning: fallbackMessage,
  });
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);

    const supabase = await createSupabaseServerClient();

    if (ctx.role === "candidate_pro" || ctx.role === "candidate_free") {
      const { data: candidate, error: candidateError } = await supabase
        .from("candidates")
        .select("id")
        .eq("user_id", ctx.userId)
        .maybeSingle();
      if (candidateError) {
        const fallback = handleAssessmentReadError(
          candidateError,
          "GET /api/assessments",
          "Candidate profiles are not available in this environment yet.",
        );
        if (fallback) return fallback;
        return jsonError("Failed to resolve candidate profile", 500);
      }
      if (!candidate?.id) return jsonSuccess({ assessments: [] });

      const { data: apps, error: appsError } = await supabase
        .from("applications")
        .select("id")
        .eq("candidate_id", candidate.id);
      if (appsError) {
        const fallback = handleAssessmentReadError(
          appsError,
          "GET /api/assessments",
          "Applications are not available in this environment yet.",
        );
        if (fallback) return fallback;
        return jsonError("Failed to load assessments", 500);
      }
      const applicationIds = (apps ?? []).map((row) => row.id);
      if (applicationIds.length === 0) return jsonSuccess({ assessments: [] });

      const { data, error } = await supabase
        .from("assessments")
        .select(ASSESSMENT_SELECT_FIELDS)
        .in("application_id", applicationIds)
        .order("created_at", { ascending: false });
      if (error) {
        const fallback = handleAssessmentReadError(
          error,
          "GET /api/assessments",
          "Assessments are not available in this environment yet.",
        );
        if (fallback) return fallback;
        return jsonError("Failed to load assessments", 500);
      }
      return jsonSuccess({ assessments: data ?? [] });
    }

    const allowed = await hasAnyEnterpriseRole(
      ctx.userId,
      ["leadership", "recruiter", "hiring_manager", "interviewer", "super_admin"],
      supabase,
    );
    if (!allowed) return jsonError("Forbidden", 403);

    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const applicationId = url.searchParams.get("applicationId");
    const jobId = url.searchParams.get("jobId");
    const stageId = url.searchParams.get("stageId");

    if (jobId && stageId) {
      const stageOk = await assertStageBelongsToJob(supabase, stageId, jobId);
      if (!stageOk) return jsonError("Stage does not belong to this job", 400);
    }

    if (hasRole(ctx, "interviewer")) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const interviewerEmail = user?.email?.trim().toLowerCase();
      if (!interviewerEmail) return jsonSuccess({ assessments: [] });

      const { data: assignedStages, error: stageError } = await supabase
        .from("pipeline_stages")
        .select("id")
        .ilike("interviewer_email", interviewerEmail);
      if (stageError) {
        const fallback = handleAssessmentReadError(
          stageError,
          "GET /api/assessments",
          "Interview assignments are not available in this environment yet.",
        );
        if (fallback) return fallback;
        return jsonError("Failed to load interview assignments", 500);
      }
      if (!assignedStages?.length) return jsonSuccess({ assessments: [] });

      const stageIds = assignedStages.map((s) => s.id as string);
      const { data: pcs, error: pcError } = await supabase
        .from("pipeline_candidates")
        .select("job_id, candidate_id")
        .in("stage_id", stageIds);
      if (pcError) {
        const fallback = handleAssessmentReadError(
          pcError,
          "GET /api/assessments",
          "Pipeline rows are not available in this environment yet.",
        );
        if (fallback) return fallback;
        return jsonError("Failed to load pipeline rows", 500);
      }
      if (!pcs?.length) return jsonSuccess({ assessments: [] });

      const jobIds = [...new Set(pcs.map((p) => p.job_id as string))];
      const candidateIds = [...new Set(pcs.map((p) => p.candidate_id as string))];
      const { data: apps, error: appsError } = await supabase
        .from("applications")
        .select("id, job_id, candidate_id, jobs!inner(organisation_id)")
        .eq("jobs.organisation_id", ctx.organisationId)
        .in("job_id", jobIds)
        .in("candidate_id", candidateIds);
      if (appsError) {
        const fallback = handleAssessmentReadError(
          appsError,
          "GET /api/assessments",
          "Applications are not available in this environment yet.",
        );
        if (fallback) return fallback;
        return jsonError("Failed to load applications", 500);
      }

      const pairKey = (jobId: string, candidateId: string) => `${jobId}:${candidateId}`;
      const allowedPairs = new Set(
        pcs.map((p) => pairKey(p.job_id as string, p.candidate_id as string)),
      );
      let applicationIds = (apps ?? [])
        .filter((a) => allowedPairs.has(pairKey(a.job_id as string, a.candidate_id as string)))
        .map((a) => a.id as string);
      if (jobId) {
        applicationIds = applicationIds.filter(
          (id) => (apps ?? []).find((a) => a.id === id)?.job_id === jobId,
        );
      }
      if (applicationIds.length === 0) return jsonSuccess({ assessments: [] });

      let interviewerQuery = supabase
        .from("assessments")
        .select(ASSESSMENT_SELECT_FIELDS)
        .eq("organisation_id", ctx.organisationId)
        .in("application_id", applicationIds)
        .order("created_at", { ascending: false });
      if (status) interviewerQuery = interviewerQuery.eq("status", status);
      if (stageId) interviewerQuery = interviewerQuery.eq("stage_id", stageId);
      if (applicationId) {
        if (!applicationIds.includes(applicationId)) {
          return jsonSuccess({ assessments: [] });
        }
        interviewerQuery = interviewerQuery.eq("application_id", applicationId);
      }
      const { data, error } = await interviewerQuery;
      if (error) {
        const fallback = handleAssessmentReadError(
          error,
          "GET /api/assessments",
          "Assessments are not available in this environment yet.",
        );
        if (fallback) return fallback;
        return jsonError("Failed to load assessments", 500);
      }
      return jsonSuccess({ assessments: data ?? [] });
    }

    let scopedApplicationIds: string[] | null = null;
    if (jobId) {
      const resolved = await applicationIdsForJob(supabase, ctx.organisationId, jobId);
      if ("error" in resolved) return resolved.error;
      scopedApplicationIds = resolved.ids;
      if (scopedApplicationIds.length === 0) return jsonSuccess({ assessments: [] });
    }

    let query = supabase
      .from("assessments")
      .select(ASSESSMENT_SELECT_FIELDS)
      .eq("organisation_id", ctx.organisationId)
      .order("created_at", { ascending: false });
    if (status) query = query.eq("status", status);
    if (scopedApplicationIds) query = query.in("application_id", scopedApplicationIds);
    if (stageId) query = query.eq("stage_id", stageId);
    if (applicationId) {
      if (scopedApplicationIds && !scopedApplicationIds.includes(applicationId)) {
        return jsonSuccess({ assessments: [] });
      }
      query = query.eq("application_id", applicationId);
    }

    const { data, error } = await query;
    if (error) {
      const fallback = handleAssessmentReadError(
        error,
        "GET /api/assessments",
        "Assessments are not available in this environment yet.",
      );
      if (fallback) return fallback;
      return jsonError("Failed to load assessments", 500);
    }
    return jsonSuccess({ assessments: data ?? [] });
  } catch (err) {
    return handleApiError(err, "Failed to fetch assessments", { route: "GET /api/assessments" });
  }
}

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);

    const supabase = await createSupabaseServerClient();
    const allowed = await hasAnyEnterpriseRole(
      ctx.userId,
      ["leadership", "recruiter", "hiring_manager", "interviewer", "super_admin"],
      supabase,
    );
    if (!allowed) return jsonError("Forbidden", 403);

    const rolePermissions = await getOrgSettingsPermissions(supabase, ctx.organisationId);
    const canCreate =
      ctx.role === "leadership" ||
      ctx.role === "super_admin" ||
      hasSettingsCapability(ctx.role, "create_assessments", rolePermissions);
    if (!canCreate) {
      return jsonError(
        "Assessment/test creation is disabled for your role. Ask your company admin to enable it.",
        403,
      );
    }

    const { body, errorResponse } = await parseJsonBody(request, "POST /api/assessments");
    if (errorResponse) return errorResponse;
    const parsed = createAssessmentSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const { data: app } = await supabase
      .from("applications")
      .select("id, candidate_id, job_id, jobs!inner(organisation_id)")
      .eq("id", parsed.data.applicationId)
      .single();
    const appJob = app?.jobs as { organisation_id?: string } | null;
    if (!app || appJob?.organisation_id !== ctx.organisationId) {
      return jsonError("Application not found", 404);
    }

    if (parsed.data.stageId) {
      const stageOk = await assertStageBelongsToJob(
        supabase,
        parsed.data.stageId,
        app.job_id as string,
      );
      if (!stageOk) return jsonError("Stage does not belong to this job", 400);
    }

    const shareToken = createAssessmentShareToken();
    const row: Record<string, unknown> = {
      application_id: parsed.data.applicationId,
      stage_id: parsed.data.stageId ?? null,
      organisation_id: ctx.organisationId,
      type: parsed.data.type,
      title: parsed.data.title,
      instructions: parsed.data.instructions ?? null,
      deadline_at: parsed.data.deadlineAt,
      reviewer_id: parsed.data.reviewerId ?? null,
      pass_threshold_pct: parsed.data.passThresholdPct ?? null,
      auto_advance: parsed.data.autoAdvance ?? false,
      external_platform: parsed.data.externalPlatform ?? null,
      webhook_url: parsed.data.webhookUrl ?? null,
      created_by: ctx.userId,
      status: "pending",
      share_token: shareToken,
    };

    const { data: assessment, error } = await supabase
      .from("assessments")
      .insert(row)
      .select(ASSESSMENT_SELECT_FIELDS)
      .single();
    if (error || !assessment) return jsonError("Failed to create assessment", 500);

    if (assessment.reviewer_id) {
      const ok = await createNotification({
        userId: assessment.reviewer_id,
        type: "approval_needed",
        title: "Assessment assigned for review",
        body: `${assessment.title} has been assigned to you.`,
        link: buildJobAssessmentsHref(app.job_id as string),
        metadata: { assessmentId: assessment.id, jobId: app.job_id },
      });
      if (!ok) {
        logger.warn("createNotification failed", {
          route: "POST /api/assessments",
          userId: assessment.reviewer_id,
        });
      }
    }

    const channels = parsed.data.shareChannels ?? [];
    let shareDelivery: { emailSent: boolean; whatsappSent: boolean } | null = null;

    if (channels.length > 0) {
      const { data: candidate } = await supabase
        .from("candidates")
        .select("name, email, phone")
        .eq("id", app.candidate_id)
        .maybeSingle();

      shareDelivery = await sendAssessmentShareMessages({
        channels,
        recipientName: candidate?.name ?? null,
        recipientEmail: parsed.data.recipientEmail ?? candidate?.email ?? null,
        recipientPhone: parsed.data.recipientPhone ?? candidate?.phone ?? null,
        assessmentTitle: parsed.data.title,
        deadlineAt: parsed.data.deadlineAt,
        shareToken,
      });
    }

    return jsonSuccess(
      {
        assessment,
        share: {
          token: shareToken,
          shareUrl: getAssessmentShareUrl(shareToken),
          delivery: shareDelivery,
        },
      },
      201,
    );
  } catch (err) {
    return handleApiError(err, "Failed to create assessment", { route: "POST /api/assessments" });
  }
}

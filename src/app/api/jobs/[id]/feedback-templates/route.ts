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
} from "@/lib/api-helpers";
import { assertInterviewerJobAccess, assertJobAccess } from "@/lib/job-access";
import { logger } from "@/lib/observability/logger";
import { validateOrigin } from "@/lib/security/csrf";
import { ensureIndustryFeedbackTemplateForJob } from "@/lib/feedback/industry-feedback-template";
import { scorecardFieldsSchema } from "@/lib/feedback/scorecard";

const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;

const FEEDBACK_TEMPLATE_SELECT_COLUMNS =
  "id, job_id, name, fields, created_by, created_at, updated_at";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...RECRUITER_ROLES, "interviewer")) return jsonError("Forbidden", 403);

    const { id: jobId } = await params;
    const supabase = await createSupabaseServerClient();
    let job = (await assertJobAccess(supabase, ctx, jobId)).job;
    if (!job && hasRole(ctx, "interviewer")) {
      job = (await assertInterviewerJobAccess(supabase, ctx, jobId)).job;
    }
    if (!job) return jsonError("Job not found", 404);

    const { data: jobData } = await supabase
      .from("jobs")
      .select("id, role_function")
      .eq("id", jobId)
      .maybeSingle();

    await ensureIndustryFeedbackTemplateForJob(supabase, {
      jobId,
      roleFunction: (jobData?.role_function as string | null | undefined) ?? null,
      createdBy: ctx.userId,
    });

    const { data, error } = await supabase
      .from("feedback_form_templates")
      .select(FEEDBACK_TEMPLATE_SELECT_COLUMNS)
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("Failed to fetch feedback templates", {
        error: String(error),
      });
      return jsonError("Failed to fetch templates", 500);
    }

    return jsonSuccess({ templates: data ?? [] });
  } catch (err) {
    return handleApiError(err, "Failed to fetch templates", {
      route: "GET /api/jobs/[id]/feedback-templates",
    });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

    const { id: jobId } = await params;

    const parsedBody = await parseJsonBody<{ name?: unknown; fields?: unknown }>(
      request,
      "POST /api/jobs/[id]/feedback-templates",
    );
    if (parsedBody.errorResponse) return parsedBody.errorResponse;

    const name = typeof parsedBody.body?.name === "string" ? parsedBody.body.name.trim() : "";
    if (!name) return jsonError("Template name is required", 422);
    const rawFields = parsedBody.body?.fields;
    if (!Array.isArray(rawFields) || rawFields.length === 0) {
      return jsonError("At least one field is required", 422);
    }
    const fieldsParsed = scorecardFieldsSchema.safeParse(rawFields);
    if (!fieldsParsed.success) {
      return jsonError(fieldsParsed.error.issues[0]?.message ?? "Invalid competency", 422);
    }

    const supabase = await createSupabaseServerClient();
    const { job } = await assertJobAccess(supabase, ctx, jobId);
    if (!job) return jsonError("Job not found", 404);

    const { data, error } = await supabase
      .from("feedback_form_templates")
      .insert({
        job_id: jobId,
        name,
        fields: fieldsParsed.data,
        created_by: ctx.userId,
      })
      .select(FEEDBACK_TEMPLATE_SELECT_COLUMNS)
      .single();

    if (error) {
      logger.error("Failed to create feedback template", {
        error: String(error),
      });
      return jsonError("Failed to create template", 500);
    }

    return jsonSuccess({ template: data }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to create template", {
      route: "POST /api/jobs/[id]/feedback-templates",
    });
  }
}

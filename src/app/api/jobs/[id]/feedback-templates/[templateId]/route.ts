import { NextRequest } from "next/server";
import { z } from "zod";
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
import { assertJobAccess } from "@/lib/job-access";
import { logger } from "@/lib/observability/logger";
import { validateOrigin } from "@/lib/security/csrf";
import { scorecardFieldsSchema } from "@/lib/feedback/scorecard";

const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;

const SELECT_COLUMNS = "id, job_id, name, fields, created_by, created_at, updated_at";

const patchSchema = z
  .object({
    name: z.string().trim().min(1, "Template name is required").max(200),
    fields: scorecardFieldsSchema,
  })
  .strict();

/** PATCH /api/jobs/[id]/feedback-templates/[templateId] — edit name + competencies. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; templateId: string }> },
) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

    const { id: jobId, templateId } = await params;

    const parsedBody = await parseJsonBody<unknown>(request, "PATCH feedback-template");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const bodyParsed = patchSchema.safeParse(parsedBody.body);
    if (!bodyParsed.success) {
      return jsonError(bodyParsed.error.issues[0]?.message ?? "Invalid request body", 422);
    }

    const supabase = await createSupabaseServerClient();
    const { job } = await assertJobAccess(supabase, ctx, jobId);
    if (!job) return jsonError("Job not found", 404);

    const { data, error } = await supabase
      .from("feedback_form_templates")
      .update({
        name: bodyParsed.data.name,
        fields: bodyParsed.data.fields,
        updated_at: new Date().toISOString(),
      })
      .eq("id", templateId)
      .eq("job_id", jobId)
      .select(SELECT_COLUMNS)
      .maybeSingle();

    if (error) {
      logger.error("Failed to update feedback template", { error: String(error) });
      return jsonError("Failed to update template", 500);
    }
    if (!data) return jsonError("Template not found", 404);

    return jsonSuccess({ template: data });
  } catch (err) {
    return handleApiError(err, "Failed to update template", {
      route: "PATCH /api/jobs/[id]/feedback-templates/[templateId]",
    });
  }
}

/** DELETE /api/jobs/[id]/feedback-templates/[templateId] — remove a template. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; templateId: string }> },
) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

    const { id: jobId, templateId } = await params;

    const supabase = await createSupabaseServerClient();
    const { job } = await assertJobAccess(supabase, ctx, jobId);
    if (!job) return jsonError("Job not found", 404);

    const { error } = await supabase
      .from("feedback_form_templates")
      .delete()
      .eq("id", templateId)
      .eq("job_id", jobId);

    if (error) {
      logger.error("Failed to delete feedback template", { error: String(error) });
      return jsonError("Failed to delete template", 500);
    }

    return jsonSuccess({ ok: true });
  } catch (err) {
    return handleApiError(err, "Failed to delete template", {
      route: "DELETE /api/jobs/[id]/feedback-templates/[templateId]",
    });
  }
}

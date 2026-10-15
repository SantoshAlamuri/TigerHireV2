import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
import { assertJobAccess } from "@/lib/job-access";
import { validateOrigin } from "@/lib/security/csrf";
import { updateJobScreeningQuestionSchema } from "@/lib/validations/job-screening-questions";

const READER = [
  "super_admin",
  "leadership",
  "recruiter",
  "hiring_manager",
  "finance",
  "agency",
] as const;
const WRITER = ["super_admin", "leadership", "recruiter"] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; qid: string }> },
) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...WRITER)) return jsonError("Forbidden", 403);

    const { id: jobId, qid } = await params;
    const supabase = await createSupabaseServerClient();
    const { job } = await assertJobAccess(supabase, ctx, jobId);
    if (!job) return jsonError("Job not found", 404);

    const body = await parseJsonBody(request, "PATCH screening-question");
    if (body.errorResponse) return body.errorResponse;
    const parsed = updateJobScreeningQuestionSchema.safeParse(body.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const p = parsed.data;
    const patch: Record<string, unknown> = {};
    if (p.questionText != null) patch.question_text = p.questionText;
    if (p.failOnYes != null) patch.fail_on_yes = p.failOnYes;
    if (p.sortOrder != null) patch.sort_order = p.sortOrder;
    if (p.isActive != null) patch.is_active = p.isActive;
    if (p.answerType != null) {
      patch.answer_type = p.answerType;
      // Keep options consistent with the type (yes_no never carries options).
      if (p.answerType === "yes_no") patch.options = null;
    }
    if (p.options !== undefined) patch.options = p.options;
    const userKeys = Object.keys(patch);
    if (userKeys.length === 0) {
      return jsonError("No fields to update", 400);
    }
    patch.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("job_screening_questions")
      .update(patch)
      .eq("id", qid)
      .eq("job_id", jobId)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!data) return jsonError("Question not found", 404);
    return jsonSuccess({ id: data.id as string });
  } catch (err) {
    return handleApiError(err, "Failed to update screening question", { route: "PATCH screening" });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; qid: string }> },
) {
  const csrf = validateOrigin(_req);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...WRITER)) return jsonError("Forbidden", 403);

    const { id: jobId, qid } = await params;
    const supabase = await createSupabaseServerClient();
    const { job } = await assertJobAccess(supabase, ctx, jobId);
    if (!job) return jsonError("Job not found", 404);

    const { data, error } = await supabase
      .from("job_screening_questions")
      .delete()
      .eq("id", qid)
      .eq("job_id", jobId)
      .select("id");
    if (error) throw error;
    if (!data?.length) return jsonError("Question not found", 404);
    return jsonSuccess({ deleted: true });
  } catch (err) {
    return handleApiError(err, "Failed to delete screening question", {
      route: "DELETE screening",
    });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; qid: string }> },
) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...READER)) return jsonError("Forbidden", 403);

    const { id: jobId, qid } = await params;
    const supabase = await createSupabaseServerClient();
    const { job } = await assertJobAccess(supabase, ctx, jobId);
    if (!job) return jsonError("Job not found", 404);

    const { data, error } = await supabase
      .from("job_screening_questions")
      .select(
        "id, job_id, question_text, fail_on_yes, sort_order, is_active, created_at, updated_at",
      )
      .eq("id", qid)
      .eq("job_id", jobId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return jsonError("Not found", 404);
    return jsonSuccess({
      question: {
        id: data.id,
        jobId: data.job_id,
        questionText: data.question_text,
        failOnYes: data.fail_on_yes,
        sortOrder: data.sort_order,
        isActive: data.is_active,
        createdAt: data.created_at,
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to load question", { route: "GET screening" });
  }
}

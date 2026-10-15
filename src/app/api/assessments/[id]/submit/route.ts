import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
  handleZodError,
} from "@/lib/api-helpers";
import { submitAssessmentSchema } from "@/lib/validations/assessments";
import { validateOrigin } from "@/lib/security/csrf";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const { id } = await params;
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const { body, errorResponse } = await parseJsonBody(
      request,
      "POST /api/assessments/[id]/submit",
    );
    if (errorResponse) return errorResponse;
    const parsed = submitAssessmentSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const supabase = await createSupabaseServerClient();
    const { data: assessment, error: assessmentError } = await supabase
      .from("assessments")
      .select("id, status, deadline_at, application_id")
      .eq("id", id)
      .single();
    if (assessmentError || !assessment) return jsonError("Assessment not found", 404);

    const { data: candidate, error: candidateError } = await supabase
      .from("candidates")
      .select("id")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (candidateError) return jsonError("Failed to verify candidate access", 500);
    if (!candidate?.id) return jsonError("Forbidden", 403);

    const { data: app, error: appError } = await supabase
      .from("applications")
      .select("id, candidate_id")
      .eq("id", assessment.application_id)
      .single();
    if (appError || !app) return jsonError("Assessment application not found", 404);
    if (app.candidate_id !== candidate.id) return jsonError("Forbidden", 403);

    if (assessment.status !== "pending") {
      return jsonError("Assessment already submitted or scored", 409);
    }
    if (new Date(assessment.deadline_at).getTime() < Date.now()) {
      return jsonError("Assessment deadline has passed", 409);
    }

    const { data: updated, error } = await supabase
      .from("assessments")
      .update({
        submission_text: parsed.data.submissionText ?? null,
        submission_url: parsed.data.submissionUrl ?? null,
        status: "submitted",
        submitted_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "pending")
      .select(
        "id, application_id, status, deadline_at, submission_text, submission_url, submitted_at",
      )
      .single();

    if (!updated) return jsonError("Assessment already submitted or scored", 409);
    if (error) return jsonError("Failed to submit assessment", 500);
    return jsonSuccess({ assessment: updated });
  } catch (err) {
    return handleApiError(err, "Failed to submit assessment", {
      route: "POST /api/assessments/[id]/submit",
    });
  }
}

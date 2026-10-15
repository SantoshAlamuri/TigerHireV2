import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  ensureOrganisationAccess,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
  handleZodError,
} from "@/lib/api-helpers";
import { scoreAssessmentSchema } from "@/lib/validations/assessments";
import { hasAnyEnterpriseRole } from "@/lib/security/enterprise-roles";
import { autoAdvanceAssessmentStage } from "@/lib/assessments/auto-advance";
import { validateOrigin } from "@/lib/security/csrf";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/services/notifications";
import { logger } from "@/lib/observability/logger";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const { id } = await params;
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const supabase = await createSupabaseServerClient();
    const allowed = await hasAnyEnterpriseRole(
      ctx.userId,
      ["interviewer", "hiring_manager", "recruiter", "leadership", "super_admin"],
      supabase,
    );
    if (!allowed) return jsonError("Forbidden", 403);

    const { body, errorResponse } = await parseJsonBody(
      request,
      "POST /api/assessments/[id]/score",
    );
    if (errorResponse) return errorResponse;
    const parsed = scoreAssessmentSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const pct = Number(((parsed.data.score / parsed.data.maxScore) * 100).toFixed(2));
    const { data: assessment, error: assessmentError } = await supabase
      .from("assessments")
      .select(
        "id, title, status, application_id, stage_id, pass_threshold_pct, auto_advance, applications!inner(jobs!inner(organisation_id))",
      )
      .eq("id", id)
      .single();
    if (assessmentError || !assessment) return jsonError("Assessment not found", 404);
    const appRelation = (
      assessment as {
        applications?:
          | {
              jobs?:
                | { organisation_id?: string | null }
                | Array<{ organisation_id?: string | null }>;
            }
          | Array<{
              jobs?:
                | { organisation_id?: string | null }
                | Array<{ organisation_id?: string | null }>;
            }>
          | null;
      }
    ).applications;
    const appRecord = Array.isArray(appRelation) ? appRelation[0] : appRelation;
    const jobsRelation = appRecord?.jobs;
    const jobRecord = Array.isArray(jobsRelation) ? jobsRelation[0] : jobsRelation;
    const orgAccessError = ensureOrganisationAccess(ctx, jobRecord?.organisation_id ?? null);
    if (orgAccessError) return orgAccessError;
    if (assessment.status !== "submitted") {
      return jsonError("Assessment must be submitted before scoring", 409);
    }

    const { data: updated, error } = await supabase
      .from("assessments")
      .update({
        status: "scored",
        score: parsed.data.score,
        max_score: parsed.data.maxScore,
        feedback: parsed.data.feedback ?? null,
        scored_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "submitted")
      .select(
        "id, application_id, stage_id, status, score, max_score, feedback, scored_at, pass_threshold_pct, auto_advance",
      )
      .single();
    if (!updated) return jsonError("Assessment has already been scored", 409);
    if (error) return jsonError("Failed to score assessment", 500);

    const threshold = assessment.pass_threshold_pct ?? null;
    let autoAdvanced = false;
    if (assessment.auto_advance && threshold !== null && pct >= threshold) {
      autoAdvanced = await autoAdvanceAssessmentStage(
        assessment.application_id as string,
        (assessment.stage_id as string | null) ?? null,
      );
    }

    const feedbackText = (parsed.data.feedback ?? "").trim();
    try {
      const admin = createSupabaseAdmin();
      const [{ data: appLite }, { data: scorerProfile }] = await Promise.all([
        admin
          .from("applications")
          .select("candidate_id, job_id")
          .eq("id", assessment.application_id as string)
          .maybeSingle(),
        admin.from("profiles").select("full_name").eq("id", ctx.userId).maybeSingle(),
      ]);
      if (appLite?.candidate_id) {
        const titleLine = String((assessment as { title?: string | null }).title ?? "Assessment");
        const lines = [
          `[Assessment] ${titleLine}`,
          `Score: ${parsed.data.score}/${parsed.data.maxScore} (${pct}%).`,
        ];
        if (feedbackText) lines.push(`Feedback: ${feedbackText}`);
        const by = scorerProfile?.full_name?.trim();
        if (by) lines.push(`Rated by: ${by}`);
        const body = lines.join("\n").slice(0, 5000);
        const { error: noteErr } = await admin.from("candidate_notes").insert({
          candidate_id: appLite.candidate_id as string,
          job_id: (appLite.job_id as string | null) ?? null,
          author_id: ctx.userId,
          body,
        });
        if (noteErr) {
          logger.warn("assessment score: candidate note insert failed", {
            error: String(noteErr),
            assessmentId: id,
          });
        }

        const { data: candRow } = await admin
          .from("candidates")
          .select("user_id")
          .eq("id", appLite.candidate_id as string)
          .maybeSingle();
        const candidateUserId = candRow?.user_id as string | null | undefined;
        if (candidateUserId) {
          const notified = await createNotification({
            userId: candidateUserId,
            type: "application_update",
            title: `Assessment graded: ${titleLine}`,
            body: feedbackText
              ? `Score ${parsed.data.score}/${parsed.data.maxScore} (${pct}%). ${feedbackText.slice(0, 280)}${feedbackText.length > 280 ? "…" : ""}`
              : `Your score is ${parsed.data.score}/${parsed.data.maxScore} (${pct}%).`,
            link: "/candidate/assessments",
            metadata: { assessmentId: id },
          });
          if (!notified) {
            logger.warn("assessment score: candidate notification failed", { assessmentId: id });
          }
        }
      }
    } catch (sideErr) {
      logger.warn("assessment score: post-score side effects failed", {
        error: String(sideErr),
        assessmentId: id,
      });
    }

    return jsonSuccess({ assessment: updated, scorePct: pct, autoAdvanced });
  } catch (err) {
    return handleApiError(err, "Failed to score assessment", {
      route: "POST /api/assessments/[id]/score",
    });
  }
}

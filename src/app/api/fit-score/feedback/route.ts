import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  hasRole,
  jsonError,
  jsonSuccess,
  parseJsonBody,
  requireAuth,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { assertJobAccess } from "@/lib/job-access";

const ALLOWED_ROLES = ["super_admin", "recruiter", "leadership", "hiring_manager"] as const;

const feedbackBodySchema = z
  .object({
    jobId: z.string().uuid(),
    candidateId: z.string().uuid(),
    fitScoreId: z.string().uuid(),
    accuracy: z.enum(["accurate", "too_low", "too_high"]),
    reason: z
      .enum([
        "skill_gap",
        "experience_level_mismatch",
        "location_constraint",
        "salary_expectation_mismatch",
        "domain_mismatch",
        "cultural_fit_concern",
        "role_filled_internally",
      ])
      .optional(),
    note: z.string().trim().max(140).optional(),
  })
  .strict();

const feedbackQuerySchema = z
  .object({
    jobId: z.string().uuid(),
    candidateId: z.string().uuid(),
    fitScoreId: z.string().uuid().optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, ...ALLOWED_ROLES)) return jsonError("Forbidden", 403);

  const queryParsed = feedbackQuerySchema.safeParse({
    jobId: request.nextUrl.searchParams.get("jobId"),
    candidateId: request.nextUrl.searchParams.get("candidateId"),
    fitScoreId: request.nextUrl.searchParams.get("fitScoreId") ?? undefined,
  });
  if (!queryParsed.success) {
    return jsonError(queryParsed.error.issues.map((i) => i.message).join("; "), 422);
  }

  const { jobId, candidateId, fitScoreId } = queryParsed.data;
  const supabase = await createSupabaseServerClient();
  const { job } = await assertJobAccess(supabase, ctx, jobId);
  if (!job) return jsonError("Job not found", 404);

  let query = supabase
    .from("hiring_outcomes")
    .select("id")
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .eq("submitted_by", ctx.userId)
    .not("accuracy_signal", "is", null)
    .limit(1);

  if (fitScoreId) query = query.eq("fit_score_id", fitScoreId);

  const { data } = await query;
  return jsonSuccess({ hasFeedback: Boolean((data?.length ?? 0) > 0) });
}

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, ...ALLOWED_ROLES)) return jsonError("Forbidden", 403);

  const parsedBody = await parseJsonBody(request, "POST /api/fit-score/feedback");
  if (parsedBody.errorResponse) return parsedBody.errorResponse;

  const bodyParsed = feedbackBodySchema.safeParse(parsedBody.body);
  if (!bodyParsed.success) {
    return jsonError(bodyParsed.error.issues.map((i) => i.message).join("; "), 422);
  }

  const supabase = await createSupabaseServerClient();
  const { jobId, candidateId, fitScoreId, accuracy } = bodyParsed.data;
  const reason = bodyParsed.data.reason ?? null;
  const note = bodyParsed.data.note?.trim() || null;

  const { job } = await assertJobAccess(supabase, ctx, jobId);
  if (!job) return jsonError("Job not found", 404);

  const { data: fitScore, error: fitScoreErr } = await supabase
    .from("fit_scores")
    .select("id, job_id, candidate_id, overall_score, primary_score, scoring_version")
    .eq("id", fitScoreId)
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .maybeSingle();

  if (fitScoreErr || !fitScore) return jsonError("Fit score not found for this candidate/job", 404);

  const primary = fitScore.primary_score;
  const overall = fitScore.overall_score;
  const scoreValueRaw =
    primary != null && primary !== ("" as unknown)
      ? Number(primary)
      : overall != null
        ? Number(overall)
        : null;
  const fitScoreValue =
    scoreValueRaw != null && Number.isFinite(scoreValueRaw)
      ? Math.max(0, Math.min(100, Math.round(scoreValueRaw)))
      : null;

  const payload = {
    job_id: jobId,
    candidate_id: candidateId,
    fit_score_id: fitScoreId,
    fit_score_value: fitScoreValue,
    scoring_version:
      fitScore.scoring_version != null && fitScore.scoring_version !== ("" as unknown)
        ? Number(fitScore.scoring_version)
        : 1,
    accuracy_signal: accuracy,
    feedback_reason: reason,
    note,
    outcome: null,
    organisation_id: job.organisation_id,
    submitted_by: ctx.userId,
    created_at: new Date().toISOString(),
    recorded_by: ctx.userId,
    recorded_at: new Date().toISOString(),
    source: "manual",
    source_event_id: `fit-feedback:${jobId}:${candidateId}`,
  };

  const { data: existing } = await supabase
    .from("hiring_outcomes")
    .select("id")
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .maybeSingle();

  if (existing?.id) {
    const { error: updateErr } = await supabase
      .from("hiring_outcomes")
      .update({
        fit_score_id: fitScoreId,
        fit_score_value: fitScoreValue,
        scoring_version:
          fitScore.scoring_version != null && fitScore.scoring_version !== ("" as unknown)
            ? Number(fitScore.scoring_version)
            : 1,
        accuracy_signal: accuracy,
        feedback_reason: reason,
        note,
        submitted_by: ctx.userId,
      })
      .eq("id", existing.id);
    if (updateErr) return jsonError("Failed to submit feedback", 500);
    return jsonSuccess({ submitted: true }, 201);
  }

  const { error: insertErr } = await supabase.from("hiring_outcomes").insert(payload);
  if (insertErr) {
    return jsonError("Failed to submit feedback", 500);
  }

  return jsonSuccess({ submitted: true }, 201);
}

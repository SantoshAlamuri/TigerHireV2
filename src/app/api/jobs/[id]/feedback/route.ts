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
import { createNotificationBatch } from "@/lib/services/notifications";
import { z } from "zod";

const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;

const FEEDBACK_SUBMITTER_ROLES = [...RECRUITER_ROLES, "interviewer"] as const;
const submitFeedbackBodySchema = z
  .object({
    template_id: z.string().trim().min(1).optional(),
    pipeline_candidate_id: z.string().trim().min(1).optional(),
    responses: z.record(z.string(), z.unknown()).optional(),
    overall_rating: z.number().int().optional(),
    recommendation: z.string().trim().min(1).optional(),
    notes: z.string().optional(),
  })
  .strict();

const FEEDBACK_RESPONSES_SELECT_COLUMNS =
  "id, template_id, job_id, pipeline_candidate_id, submitted_by, responses, overall_rating, recommendation, notes, created_at";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

    const { id: jobId } = await params;
    const url = new URL(request.url);
    const pipelineCandidateId = url.searchParams.get("pipeline_candidate_id");

    const supabase = await createSupabaseServerClient();
    const { job } = await assertJobAccess(supabase, ctx, jobId);
    if (!job) return jsonError("Job not found", 404);

    let query = supabase
      .from("feedback_responses")
      .select("*, feedback_form_templates(name)")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (pipelineCandidateId) {
      query = query.eq("pipeline_candidate_id", pipelineCandidateId);
    }

    const { data, error } = await query;

    if (error) {
      logger.error("Failed to fetch feedback", { error: String(error) });
      return jsonError("Failed to fetch feedback", 500);
    }

    const responses = data ?? [];

    const ratings = responses
      .map((r: { overall_rating?: number | null }) => r.overall_rating)
      .filter((r): r is number => r != null);
    const avgRating =
      ratings.length > 0
        ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
        : null;

    const recommendations: Record<string, number> = {};
    for (const r of responses) {
      const rec = (r as { recommendation?: string }).recommendation;
      if (rec) recommendations[rec] = (recommendations[rec] ?? 0) + 1;
    }

    return jsonSuccess({
      responses,
      aggregate: {
        count: responses.length,
        avgRating,
        recommendations,
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch feedback", {
      route: "GET /api/jobs/[id]/feedback",
    });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...FEEDBACK_SUBMITTER_ROLES)) return jsonError("Forbidden", 403);

    const { id: jobId } = await params;

    const parsed = await parseJsonBody<{
      template_id?: string;
      pipeline_candidate_id?: string;
      responses?: Record<string, unknown>;
      overall_rating?: number;
      recommendation?: string;
      notes?: string;
    }>(request, "POST /api/jobs/[id]/feedback");
    if (parsed.errorResponse) return parsed.errorResponse;
    const bodyParsed = submitFeedbackBodySchema.safeParse(parsed.body);
    if (!bodyParsed.success) return jsonError("Invalid request body", 422);
    const body = bodyParsed.data;

    if (!body.template_id) return jsonError("template_id is required", 422);
    if (!body.pipeline_candidate_id) return jsonError("pipeline_candidate_id is required", 422);

    // A recommendation is required server-side (client-only enforcement let empty
    // verdicts through). "cannot_assess" is the dispute path — wrong candidate / no
    // data — and is the one recommendation that doesn't require an overall rating.
    const validRecommendations = [
      "strong_hire",
      "hire",
      "no_hire",
      "strong_no_hire",
      "cannot_assess",
    ];
    if (!body.recommendation) return jsonError("recommendation is required", 422);
    if (!validRecommendations.includes(body.recommendation)) {
      return jsonError("Invalid recommendation value", 422);
    }
    const isDispute = body.recommendation === "cannot_assess";
    if (!isDispute) {
      if (body.overall_rating == null) return jsonError("overall_rating is required", 422);
      if (body.overall_rating < 1 || body.overall_rating > 5) {
        return jsonError("overall_rating must be between 1 and 5", 422);
      }
    }

    const supabase = await createSupabaseServerClient();
    let job = (await assertJobAccess(supabase, ctx, jobId)).job;
    if (!job && hasRole(ctx, "interviewer")) {
      job = (await assertInterviewerJobAccess(supabase, ctx, jobId, body.pipeline_candidate_id))
        .job;
    }
    if (!job) return jsonError("Job not found", 404);

    // Snapshot the competency set so a later template edit can't change what this feedback meant.
    const { data: templateRow } = await supabase
      .from("feedback_form_templates")
      .select("fields")
      .eq("id", body.template_id)
      .eq("job_id", jobId)
      .maybeSingle();

    // One feedback row per (candidate, submitter): a resubmit REVISES the
    // submitter's own feedback rather than stacking a second, contradictory row.
    // Backed by a partial unique index so a concurrent double-submit can't slip a
    // duplicate past this check.
    const feedbackRow = {
      template_id: body.template_id,
      job_id: jobId,
      pipeline_candidate_id: body.pipeline_candidate_id,
      submitted_by: ctx.userId,
      responses: body.responses ?? {},
      overall_rating: body.overall_rating ?? null,
      recommendation: body.recommendation ?? null,
      notes: body.notes ?? null,
      fields_snapshot: templateRow?.fields ?? null,
    };
    const { data: existingFeedback } = await supabase
      .from("feedback_responses")
      .select("id")
      .eq("pipeline_candidate_id", body.pipeline_candidate_id)
      .eq("submitted_by", ctx.userId)
      .maybeSingle();

    const { data, error } = existingFeedback
      ? await supabase
          .from("feedback_responses")
          .update(feedbackRow)
          .eq("id", existingFeedback.id as string)
          .select(FEEDBACK_RESPONSES_SELECT_COLUMNS)
          .single()
      : await supabase
          .from("feedback_responses")
          .insert(feedbackRow)
          .select(FEEDBACK_RESPONSES_SELECT_COLUMNS)
          .single();

    if (error) {
      // 23505 = the unique index caught a concurrent duplicate insert; treat it as
      // "already submitted, please refresh" rather than a 500.
      if ((error as { code?: string }).code === "23505") {
        return jsonError("You have already submitted feedback for this candidate.", 409);
      }
      logger.error("Failed to submit feedback", { error: String(error) });
      return jsonError("Failed to submit feedback", 500);
    }

    const { data: pipelineCandidate } = await supabase
      .from("pipeline_candidates")
      .select("id, candidate_id")
      .eq("id", body.pipeline_candidate_id)
      .eq("job_id", jobId)
      .maybeSingle();

    const { data: candidateRow } = pipelineCandidate?.candidate_id
      ? await supabase
          .from("candidates")
          .select("name, full_name")
          .eq("id", pipelineCandidate.candidate_id as string)
          .maybeSingle()
      : { data: null };

    const { data: jobRow } = await supabase
      .from("jobs")
      .select("title, organisation_id, assigned_recruiter_id")
      .eq("id", jobId)
      .maybeSingle();

    if (jobRow?.organisation_id) {
      const recruiterIds = new Set<string>();
      if (jobRow.assigned_recruiter_id) {
        recruiterIds.add(jobRow.assigned_recruiter_id as string);
      }

      const { data: orgRecruiters } = await supabase
        .from("profiles")
        .select("id")
        .eq("organisation_id", jobRow.organisation_id as string)
        .in("role", ["recruiter", "leadership"]);

      for (const profile of orgRecruiters ?? []) {
        if (profile.id && profile.id !== ctx.userId) {
          recruiterIds.add(profile.id as string);
        }
      }

      if (recruiterIds.size > 0) {
        const candidateName =
          (
            (candidateRow?.full_name as string | undefined) ??
            (candidateRow?.name as string | undefined) ??
            "Candidate"
          ).trim() || "Candidate";

        await createNotificationBatch([...recruiterIds], {
          type: "application_update",
          title: `Interview feedback submitted for ${candidateName}`,
          body: `New interview feedback was submitted for ${jobRow.title ?? "this role"}. Review and move the candidate to the next stage.`,
          link: `/recruit/jobs/${jobId}/feedback?pipeline_candidate_id=${encodeURIComponent(body.pipeline_candidate_id)}&template_id=${encodeURIComponent(body.template_id)}`,
          metadata: {
            jobId,
            pipelineCandidateId: body.pipeline_candidate_id,
            source: "interview_feedback_submission",
          },
        });
      }
    }

    return jsonSuccess({ feedback: data }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to submit feedback", {
      route: "POST /api/jobs/[id]/feedback",
    });
  }
}

import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { assertInterviewerJobAccess, assertJobAccess } from "@/lib/job-access";
import { validateOrigin } from "@/lib/security/csrf";
import { draftScorecard } from "@/lib/feedback/scorecard-draft";
import type { ScorecardField } from "@/lib/feedback/scorecard";

const ALLOWED_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
  "interviewer",
] as const;

const bodySchema = z.object({
  template_id: z.string().optional(),
  pipeline_candidate_id: z.string().optional(),
});

/**
 * POST /api/jobs/[id]/feedback/scorecard-draft  { template_id, pipeline_candidate_id }
 * Returns an AI draft scorecard built from the candidate's interview transcript. Never saves —
 * the interviewer reviews and submits.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...ALLOWED_ROLES)) return jsonError("Forbidden", 403);

    const { id: jobId } = await params;
    const parsed = await parseJsonBody<{ template_id?: string; pipeline_candidate_id?: string }>(
      request,
      "POST scorecard-draft",
    );
    if (parsed.errorResponse) return parsed.errorResponse;
    const validated = bodySchema.safeParse(parsed.body ?? {});
    if (!validated.success) return jsonError("Invalid request body", 400);
    const templateId = validated.data.template_id;
    const pipelineCandidateId = validated.data.pipeline_candidate_id;
    if (!templateId || !pipelineCandidateId) {
      return jsonError("template_id and pipeline_candidate_id are required", 422);
    }

    const supabase = await createSupabaseServerClient();
    let job = (await assertJobAccess(supabase, ctx, jobId)).job;
    if (!job && hasRole(ctx, "interviewer")) {
      job = (await assertInterviewerJobAccess(supabase, ctx, jobId)).job;
    }
    if (!job) return jsonError("Job not found", 404);

    const { data: template } = await supabase
      .from("feedback_form_templates")
      .select("id, name, fields")
      .eq("id", templateId)
      .eq("job_id", jobId)
      .maybeSingle();
    if (!template) return jsonError("Scorecard template not found", 404);

    const { data: jobRow } = await supabase
      .from("jobs")
      .select("title, organisation_id")
      .eq("id", jobId)
      .maybeSingle();

    // Latest completed recording with a transcript for this candidate.
    const admin = createSupabaseAdmin();
    const { data: recording } = await admin
      .from("interview_recordings")
      // interview_recordings has no candidate_id — it hangs off the pipeline
      // row. Naming it rejected the whole select, so no recording was ever
      // found and the scorecard never drafted from a transcript.
      .select("id, transcript_url, pipeline_candidates(candidate_id)")
      .eq("job_id", jobId)
      .eq("pipeline_candidate_id", pipelineCandidateId)
      .eq("status", "done")
      .not("transcript_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!recording?.transcript_url) {
      return jsonError(
        "No interview recording with a transcript was found for this candidate yet.",
        404,
      );
    }

    const { data: file } = await admin.storage
      .from("screening-audio")
      .download(recording.transcript_url as string);
    const transcript = (await file?.text())?.trim() ?? "";
    if (!transcript) {
      return jsonError("The interview transcript is empty or unavailable.", 404);
    }

    const draft = await draftScorecard({
      roleTitle: (jobRow?.title as string | null) ?? "this role",
      fields: (template.fields as ScorecardField[]) ?? [],
      transcript,
      attribution: {
        jobId,
        candidateId:
          ((recording.pipeline_candidates as { candidate_id?: string | null } | null)
            ?.candidate_id as string | null) ?? undefined,
        organisationId: (jobRow?.organisation_id as string | null) ?? undefined,
      },
    });

    return jsonSuccess({ draft });
  } catch (err) {
    return handleApiError(err, "Failed to draft scorecard", {
      route: "POST /api/jobs/[id]/feedback/scorecard-draft",
    });
  }
}

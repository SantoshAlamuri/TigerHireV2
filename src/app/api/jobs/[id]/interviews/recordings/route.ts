import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext, requireAuth, hasRole, jsonError, jsonSuccess } from "@/lib/api-helpers";
import { assertJobAccess } from "@/lib/job-access";
import { logger } from "@/lib/observability/logger";

const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;

/**
 * GET /api/jobs/[id]/interviews/recordings
 * List AI-notetaker recordings + scorecards for a job. Optional ?pipeline_candidate_id= filter.
 * Org scoping is enforced by RLS on interview_recordings (server client) plus a job-access check.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

  const { id: jobId } = await params;
  const supabase = await createSupabaseServerClient();
  const { job } = await assertJobAccess(supabase, ctx, jobId);
  if (!job) return jsonError("Job not found", 404);

  const pipelineCandidateId = request.nextUrl.searchParams.get("pipeline_candidate_id");

  let query = supabase
    .from("interview_recordings")
    .select(
      "id, slot_id, pipeline_candidate_id, status, recording_url, transcript_url, summary_json, duration_seconds, created_at",
    )
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  if (pipelineCandidateId) {
    query = query.eq("pipeline_candidate_id", pipelineCandidateId);
  }

  const { data, error } = await query;
  if (error) {
    logger.error("Failed to fetch interview recordings", { error: String(error), jobId });
    return jsonError("Failed to fetch interview recordings", 500);
  }

  return jsonSuccess({ recordings: data ?? [] });
}

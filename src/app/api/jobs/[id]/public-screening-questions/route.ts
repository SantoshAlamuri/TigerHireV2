import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { fetchActiveScreeningQuestions, toPublicQuestions } from "@/lib/screening/job-screening";

/**
 * Logged-in candidates: yes/no questions for an open job (for apply flow before POST /api/applications).
 * Does not reveal fail_on_yes; questions only for open roles.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx) || !hasRole(ctx, "candidate_pro", "candidate_free")) {
      return jsonError("Unauthorized", 401);
    }
    const { id: jobId } = await params;
    const supabase = await createSupabaseServerClient();
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("id, status")
      .eq("id", jobId)
      .maybeSingle();
    if (jobErr) throw jobErr;
    if (!job || (job as { status?: string }).status !== "open") {
      return jsonError("Job not found", 404);
    }
    const rows = await fetchActiveScreeningQuestions(supabase, jobId);
    return jsonSuccess({ questions: toPublicQuestions(rows) });
  } catch (err) {
    return handleApiError(err, "Failed to load screening questions", {
      route: "GET /api/jobs/[id]/public-screening-questions",
    });
  }
}

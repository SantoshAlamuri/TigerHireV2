import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { assertJobAccess } from "@/lib/job-access";
import { validateOrigin } from "@/lib/security/csrf";
import { triggerSchedulerAgent } from "@/lib/agents/scheduler";

const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;

/**
 * POST /api/tasks/slot-picker/[requestId]/resend
 * Re-send WhatsApp slot picker for a pending request.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

  const { requestId } = await params;
  const admin = createSupabaseAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: row, error } = await admin
    .from("interview_slot_picker_requests")
    .select("id, job_id, candidate_id, stage_id, status, organisation_id")
    .eq("id", requestId)
    .maybeSingle();

  if (error || !row) return jsonError("Slot picker request not found", 404);
  if (row.status !== "pending") {
    return jsonError("Only pending slot picker requests can be resent", 400);
  }

  const jobId = row.job_id as string;
  const { job } = await assertJobAccess(supabase, ctx, jobId);
  if (!job) return jsonError("Job not found", 404);

  if (!row.stage_id) {
    return jsonError("Slot picker request has no pipeline stage", 422);
  }

  try {
    const result = await triggerSchedulerAgent({
      candidateId: row.candidate_id as string,
      jobId,
      stageId: row.stage_id as string,
      initiatedBy: ctx.userId,
    });
    if (result.status === "skipped") {
      return jsonError(result.reason ?? "Could not resend slot picker", 422);
    }
    return jsonSuccess({ ok: true, status: result.status });
  } catch (err) {
    return handleApiError(err, "Failed to resend slot picker", {
      route: "POST /api/tasks/slot-picker/[requestId]/resend",
    });
  }
}

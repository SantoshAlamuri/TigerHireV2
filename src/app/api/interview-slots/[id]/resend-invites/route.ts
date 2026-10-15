import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthContext, requireAuth, hasRole, jsonError, jsonSuccess } from "@/lib/api-helpers";
import { assertJobAccess } from "@/lib/job-access";
import { validateOrigin } from "@/lib/security/csrf";
import { buildBookedInviteContext } from "@/lib/interviews/build-booked-invite-context";
import { runBookedInterviewDelivery } from "@/lib/interviews/run-booked-delivery";
import {
  deliveryFieldsFromRow,
  failedChannelsToRetry,
  hasCriticalDeliveryFailure,
} from "@/lib/interviews/delivery-status";

const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;

/**
 * POST /api/interview-slots/[id]/resend-invites
 * Re-attempt delivery for failed critical channels on a booked slot.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

  const { id: slotId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: slot, error: slotErr } = await supabase
    .from("interview_availability_slots")
    .select(
      "id, job_id, user_id, start_at, end_at, status, pipeline_candidate_id, candidate_email_status, interviewer_email_status, candidate_whatsapp_status, last_delivery_attempt_at",
    )
    .eq("id", slotId)
    .single();

  if (slotErr || !slot) return jsonError("Slot not found", 404);
  if (slot.status !== "booked" || !slot.pipeline_candidate_id) {
    return jsonError("Slot is not booked", 400);
  }

  const jobId = slot.job_id as string;
  const { job } = await assertJobAccess(supabase, ctx, jobId);
  if (!job) return jsonError("Job not found", 404);

  const previous = deliveryFieldsFromRow(slot);
  const channelsToRetry = failedChannelsToRetry(previous);
  if (channelsToRetry.length === 0) {
    return jsonSuccess({
      slot_id: slotId,
      message: "No failed channels to resend",
      delivery: previous,
      has_delivery_failure: hasCriticalDeliveryFailure(previous),
      failed_channels: [],
    });
  }

  const admin = createSupabaseAdmin();
  const inviteCtx = await buildBookedInviteContext(admin, {
    jobId,
    slotId,
    pipelineCandidateId: slot.pipeline_candidate_id as string,
    slotUserId: slot.user_id as string | null,
    slotStartAt: slot.start_at as string,
    slotEndAt: slot.end_at as string,
  });

  if (!inviteCtx) return jsonError("Could not load booking context", 500);

  const result = await runBookedInterviewDelivery({
    admin,
    slotId,
    organisationId: job.organisation_id ?? ctx.organisationId,
    ctx: inviteCtx,
    channelsToRetry,
  });

  return jsonSuccess({
    slot_id: slotId,
    delivery: result.delivery,
    has_delivery_failure: result.has_delivery_failure,
    failed_channels: result.failed_channels,
    channel_results: result.channel_results,
  });
}

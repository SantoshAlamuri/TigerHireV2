import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
} from "@/lib/api-helpers";
import { assertJobAccess } from "@/lib/job-access";
import { validateOrigin } from "@/lib/security/csrf";
import { bookInterviewSlotAtomically } from "@/lib/interviews/book-slot-atomic";
import { buildBookedInviteContext } from "@/lib/interviews/build-booked-invite-context";
import { runBookedInterviewDelivery } from "@/lib/interviews/run-booked-delivery";
import { z } from "zod";

const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;
const bookInterviewBodySchema = z
  .object({
    slot_id: z.string().trim().min(1).optional(),
    pipeline_candidate_id: z.string().trim().min(1).optional(),
    interviewer_email: z.string().trim().optional(),
  })
  .strict();

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * POST /api/jobs/[id]/interviews/book
 * Book an availability slot for a pipeline candidate. Body: { slot_id: string, pipeline_candidate_id: string }
 * Sets slot status=booked, pipeline_candidate_id; updates pipeline_candidates.interview_scheduled_at.
 * Calendar invites are delivered via ICS email (no OAuth calendar API required).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

  const { id: jobId } = await params;
  const supabase = await createSupabaseServerClient();
  const { job } = await assertJobAccess(supabase, ctx, jobId);
  if (!job) return jsonError("Job not found", 404);
  const effectiveOrgId = job.organisation_id ?? ctx.organisationId;

  const parsed = await parseJsonBody<{
    slot_id?: string;
    pipeline_candidate_id?: string;
    interviewer_email?: string;
  }>(request, "POST /api/jobs/[id]/interviews/book");
  if (parsed.errorResponse) return parsed.errorResponse;
  const bodyParsed = bookInterviewBodySchema.safeParse(parsed.body);
  if (!bodyParsed.success) return jsonError("Invalid request body", 422);
  const body = bodyParsed.data;
  const { slot_id, pipeline_candidate_id } = body;
  if (!slot_id || !pipeline_candidate_id) {
    return jsonError("slot_id and pipeline_candidate_id are required", 400);
  }
  const interviewerEmailInput = body.interviewer_email?.trim().toLowerCase() || null;
  if (interviewerEmailInput && !isValidEmail(interviewerEmailInput)) {
    return jsonError("interviewer_email must be a valid email", 400);
  }

  const { data: slot, error: slotErr } = await supabase
    .from("interview_availability_slots")
    .select("id, job_id, user_id, start_at, end_at, status")
    .eq("id", slot_id)
    .eq("job_id", jobId)
    .single();

  if (slotErr || !slot) return jsonError("Slot not found", 404);
  if (slot.status === "booked") return jsonError("Slot is already booked", 409);

  const { data: pc, error: pcErr } = await supabase
    .from("pipeline_candidates")
    .select("id, job_id, stage_id")
    .eq("id", pipeline_candidate_id)
    .eq("job_id", jobId)
    .single();

  if (pcErr || !pc) return jsonError("Pipeline candidate not found for this job", 404);

  if (pc.stage_id && interviewerEmailInput) {
    await supabase
      .from("pipeline_stages")
      .update({ interviewer_email: interviewerEmailInput })
      .eq("id", pc.stage_id as string)
      .eq("job_id", jobId);
  }

  const booking = await bookInterviewSlotAtomically({
    supabase,
    rpcClient: createSupabaseAdmin(),
    jobId,
    slotId: slot_id,
    pipelineCandidateId: pipeline_candidate_id,
  });
  if (!booking.ok) {
    if (booking.errorCode === "slot_not_found") return jsonError("Slot not found", 404);
    if (booking.errorCode === "slot_unavailable") return jsonError("Slot is already booked", 409);
    if (booking.errorCode === "pipeline_candidate_not_found") {
      return jsonError("Pipeline candidate not found for this job", 404);
    }
    if (booking.errorCode === "pipeline_candidate_already_booked") {
      return jsonError("Candidate already has a booked slot", 409);
    }
    return jsonError("Failed to book slot", 500);
  }

  const admin = createSupabaseAdmin();
  const inviteCtx = await buildBookedInviteContext(admin, {
    jobId,
    slotId: slot_id,
    pipelineCandidateId: pipeline_candidate_id,
    slotUserId: slot.user_id as string | null,
    slotStartAt: booking.startAt,
    slotEndAt: booking.endAt ?? (slot.end_at as string),
    interviewerEmailOverride: interviewerEmailInput,
  });

  let deliveryResult: Awaited<ReturnType<typeof runBookedInterviewDelivery>> = {
    delivery: {
      candidate_email_status: null,
      interviewer_email_status: null,
      candidate_whatsapp_status: null,
      last_delivery_attempt_at: null,
    },
    has_delivery_failure: false,
    failed_channels: [],
    channel_results: {
      candidate_email: { status: null, attempted: false },
      interviewer_email: { status: null, attempted: false },
      candidate_whatsapp: { status: null, attempted: false },
    },
  };

  if (inviteCtx) {
    deliveryResult = await runBookedInterviewDelivery({
      admin,
      slotId: slot_id,
      organisationId: effectiveOrgId,
      ctx: inviteCtx,
    });
  }

  return jsonSuccess(
    {
      slot_id,
      pipeline_candidate_id,
      interview_scheduled_at: booking.startAt,
      delivery: deliveryResult.delivery,
      has_delivery_failure: deliveryResult.has_delivery_failure,
      failed_channels: deliveryResult.failed_channels,
    },
    201,
  );
}

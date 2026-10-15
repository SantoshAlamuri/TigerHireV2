import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { bookInterviewSlotAtomically } from "@/lib/interviews/book-slot-atomic";
import { isSlotEligibleForCandidateSelfServe } from "@/lib/interviews/self-serve-slot-window";
import { isSelfServeBookable } from "@/lib/interviews/slot-bookable-by";
import { buildBookedInviteContext } from "@/lib/interviews/build-booked-invite-context";
import { runBookedInterviewDelivery } from "@/lib/interviews/run-booked-delivery";

/**
 * Book a slot for a pipeline candidate (DB + notification emails) without requiring
 * calendar/room integration — used for public self-serve. Mirrors core updates from
 * `POST /api/jobs/[id]/interviews/book`.
 */
export async function bookSelfServeInterviewSlot(
  supabase: SupabaseClient,
  input: {
    jobId: string;
    slotId: string;
    pipelineCandidateId: string;
    organisationId?: string | null;
  },
): Promise<
  | {
      ok: true;
      interview_scheduled_at: string;
      has_delivery_failure?: boolean;
      failed_channels?: string[];
    }
  | { ok: false; error: string; code?: "conflict" | "other" }
> {
  const { jobId, slotId, pipelineCandidateId: pipeline_candidate_id } = input;

  const { data: slot, error: slotErr } = await supabase
    .from("interview_availability_slots")
    .select("id, job_id, user_id, start_at, end_at, status, bookable_by")
    .eq("id", slotId)
    .eq("job_id", jobId)
    .single();

  if (slotErr || !slot) {
    return { ok: false, error: "Slot not found" };
  }
  if (slot.status === "booked") {
    return { ok: false, error: "Slot is already booked", code: "conflict" };
  }
  if (!isSelfServeBookable((slot as { bookable_by?: string }).bookable_by)) {
    return { ok: false, error: "That time is not available for self-scheduling" };
  }
  if (!isSlotEligibleForCandidateSelfServe(slot.start_at as string)) {
    return {
      ok: false,
      error: "That time is outside the booking window — please pick a time in the next few days",
    };
  }

  const { data: pc, error: pcErr } = await supabase
    .from("pipeline_candidates")
    .select("id, job_id, stage_id")
    .eq("id", pipeline_candidate_id)
    .eq("job_id", jobId)
    .single();

  if (pcErr || !pc) {
    return { ok: false, error: "Candidate not in pipeline for this job" };
  }

  const booking = await bookInterviewSlotAtomically({
    supabase: supabase as unknown as {
      rpc?: (
        fn: string,
        args: { p_job_id: string; p_slot_id: string; p_pipeline_candidate_id: string },
      ) => Promise<{ data: unknown; error: unknown }>;
      from: (table: string) => any;
    },
    jobId,
    slotId,
    pipelineCandidateId: pipeline_candidate_id,
  });
  if (!booking.ok) {
    if (booking.errorCode === "slot_unavailable") {
      return { ok: false, error: "Slot is already booked", code: "conflict" };
    }
    if (booking.errorCode === "pipeline_candidate_not_found") {
      return { ok: false, error: "Candidate not in pipeline for this job" };
    }
    return { ok: false, error: "Failed to confirm interview" };
  }

  const startAt = booking.startAt;
  const endAt = booking.endAt ?? (slot.end_at as string);

  const admin = createSupabaseAdmin();
  const inviteCtx = await buildBookedInviteContext(admin, {
    jobId,
    slotId,
    pipelineCandidateId: pipeline_candidate_id,
    slotUserId: slot.user_id as string | null,
    slotStartAt: startAt,
    slotEndAt: endAt,
  });

  let has_delivery_failure = false;
  let failed_channels: string[] = [];
  if (inviteCtx) {
    const delivery = await runBookedInterviewDelivery({
      admin,
      slotId,
      organisationId: input.organisationId,
      ctx: inviteCtx,
    });
    has_delivery_failure = delivery.has_delivery_failure;
    failed_channels = delivery.failed_channels;
  }

  return {
    ok: true,
    interview_scheduled_at: startAt,
    has_delivery_failure,
    failed_channels,
  };
}

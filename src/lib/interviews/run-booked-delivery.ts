import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import {
  deliveryFieldsFromRow,
  failedChannelsToRetry,
  hasCriticalDeliveryFailure,
  listFailedChannelLabels,
  type DeliveryChannelKey,
  type SlotDeliveryFields,
} from "@/lib/interviews/delivery-status";
import {
  sendBookedInterviewInvites,
  type BookedInviteContext,
  type SendBookedInvitesOptions,
} from "@/lib/interviews/send-booked-invites";
import { maybeDispatchNotetakerBot } from "@/lib/interviews/notetaker-dispatch";
import { syncBookedEvent } from "@/lib/calendar/interviews";

export async function persistSlotDeliveryStatus(
  admin: SupabaseClient,
  slotId: string,
  fields: SlotDeliveryFields,
): Promise<void> {
  const { error } = await admin
    .from("interview_availability_slots")
    .update({
      candidate_email_status: fields.candidate_email_status,
      interviewer_email_status: fields.interviewer_email_status,
      candidate_whatsapp_status: fields.candidate_whatsapp_status,
      last_delivery_attempt_at: fields.last_delivery_attempt_at,
    })
    .eq("id", slotId);
  if (error) {
    logger.warn("Failed to persist interview slot delivery status", {
      slotId,
      error: String(error),
    });
  }
}

export interface RunBookedDeliveryResult {
  delivery: SlotDeliveryFields;
  has_delivery_failure: boolean;
  failed_channels: string[];
  channel_results: Awaited<ReturnType<typeof sendBookedInterviewInvites>>["channelResults"];
}

export async function runBookedInterviewDelivery(params: {
  admin: SupabaseClient;
  slotId: string;
  organisationId?: string | null;
  ctx: BookedInviteContext;
  channelsToRetry?: DeliveryChannelKey[] | null;
}): Promise<RunBookedDeliveryResult> {
  const { admin, slotId, organisationId, ctx, channelsToRetry } = params;

  const { data: existing } = await admin
    .from("interview_availability_slots")
    .select(
      "candidate_email_status, interviewer_email_status, candidate_whatsapp_status, last_delivery_attempt_at",
    )
    .eq("id", slotId)
    .maybeSingle();

  const previous = existing ? deliveryFieldsFromRow(existing) : null;
  const retryKeys =
    channelsToRetry ??
    (previous && hasCriticalDeliveryFailure(previous) ? failedChannelsToRetry(previous) : null);

  const options: SendBookedInvitesOptions = {
    organisationId,
    previous,
    channelsToRetry: retryKeys,
  };

  // Put it on the organiser's calendar first, so the emails carry the video link.
  let calendar: { meetingUrl: string | null; onCalendar: boolean } = {
    meetingUrl: ctx.meetingUrl ?? null,
    onCalendar: false,
  };
  try {
    calendar = await syncBookedEvent(admin, {
      slotId,
      jobTitle: ctx.jobTitle,
      stageName: ctx.stageName,
      candidateName: ctx.candidateName,
      candidateEmail: ctx.candidateEmail,
      startAt: ctx.slotStartAt,
      endAt: ctx.slotEndAt,
    });
  } catch (err) {
    logger.warn("calendar_event_sync_threw", { slotId, error: String(err) });
  }

  const sent = await sendBookedInterviewInvites(
    { ...ctx, slotId, meetingUrl: calendar.meetingUrl, onCalendar: calendar.onCalendar },
    options,
  );
  const delivery: SlotDeliveryFields = {
    candidate_email_status: sent.candidate_email_status,
    interviewer_email_status: sent.interviewer_email_status,
    candidate_whatsapp_status: sent.candidate_whatsapp_status,
    last_delivery_attempt_at: sent.last_delivery_attempt_at,
  };

  await persistSlotDeliveryStatus(admin, slotId, delivery);

  // Best-effort: send an AI notetaker bot to the booked interview if a meeting link is set and
  // the notetaker is enabled for this org. Must never break invite delivery, so it is fire-and-
  // -forget with its own internal error handling.
  void maybeDispatchNotetakerBot({
    admin,
    slotId,
    organisationId,
    jobId: ctx.jobId,
    jobTitle: ctx.jobTitle,
    candidateName: ctx.candidateName,
    pipelineCandidateId: ctx.pipelineCandidateId,
    slotStartAt: ctx.slotStartAt,
  });

  return {
    delivery,
    has_delivery_failure: hasCriticalDeliveryFailure(delivery),
    failed_channels: listFailedChannelLabels(delivery),
    channel_results: sent.channelResults,
  };
}

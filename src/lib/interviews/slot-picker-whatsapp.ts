import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import {
  sendInterviewSlotPickerTemplate,
  sendInterviewSlotsTemplate,
  sendWhatsAppMessage,
} from "@/lib/services/whatsapp";
import type { PickerSlotOption } from "@/lib/interviews/picker-slot-options";

export type SlotPickerSendResult = {
  sent: boolean;
  skipped: boolean;
  templateName: string | null;
  messageId: string | null;
  error: string | null;
};

function buildSessionBody(
  candidateName: string,
  jobTitle: string,
  options: PickerSlotOption[],
): string {
  const lines = options.map((o, i) => `${i + 1}. ${o.label}`);
  return (
    `Hi ${candidateName}, please pick an interview time for ${jobTitle}:\n\n` +
    `${lines.join("\n")}\n\n` +
    `Reply with the number of your preferred slot (1–${options.length}).`
  );
}

/**
 * Sends slot picker via `th_interview_slot_picker` (Phase C). Falls back to `th_interview_slots` (3 slots) then session text.
 */
export async function sendSlotPickerWhatsApp(params: {
  phone: string;
  candidateName: string;
  jobTitle: string;
  options: PickerSlotOption[];
  applicationId?: string;
}): Promise<SlotPickerSendResult> {
  const { phone, candidateName, jobTitle, options, applicationId } = params;
  if (options.length === 0) {
    return { sent: false, skipped: true, templateName: null, messageId: null, error: "no_slots" };
  }

  const slotLabels = options.map((o) => o.label);
  const pad = (i: number) => slotLabels[i] ?? "—";

  const pickerResult = await sendInterviewSlotPickerTemplate({
    phone,
    candidateName,
    jobTitle,
    slot1: pad(0),
    slot2: pad(1),
    slot3: pad(2),
    slot4: options.length > 3 ? pad(3) : undefined,
    slot5: options.length > 4 ? pad(4) : undefined,
    applicationId,
  });

  if (pickerResult.success) {
    return {
      sent: true,
      skipped: false,
      templateName: "th_interview_slot_picker",
      messageId: pickerResult.messageId ?? null,
      error: null,
    };
  }

  const pickerError = pickerResult.error ?? "template_send_failed";
  const isTemplateMissing =
    pickerError.includes("132001") ||
    pickerError.toLowerCase().includes("template") ||
    pickerError.toLowerCase().includes("does not exist");

  if (isTemplateMissing) {
    logger.info("th_interview_slot_picker not available; skipping or using fallback", {
      error: pickerError,
    });
  } else {
    logger.warn("th_interview_slot_picker send failed", { error: pickerError });
  }

  if (options.length <= 3) {
    const legacy = await sendInterviewSlotsTemplate({
      phone,
      candidateName,
      jobTitle,
      slot1: pad(0),
      slot2: pad(1),
      slot3: pad(2),
      applicationId,
    });
    if (legacy.success) {
      return {
        sent: true,
        skipped: false,
        templateName: "th_interview_slots",
        messageId: legacy.messageId ?? null,
        error: null,
      };
    }
  }

  const session = await sendWhatsAppMessage(
    phone,
    buildSessionBody(candidateName, jobTitle, options),
  );
  if (session.success) {
    return {
      sent: true,
      skipped: false,
      templateName: "session",
      messageId: session.messageId ?? null,
      error: null,
    };
  }

  return {
    sent: false,
    skipped: isTemplateMissing,
    templateName: "th_interview_slot_picker",
    messageId: null,
    error: session.error ?? pickerError,
  };
}

export async function recordSlotPickerRequest(
  admin: SupabaseClient,
  params: {
    organisationId: string;
    jobId: string;
    pipelineCandidateId: string;
    candidateId: string;
    stageId: string | null;
    initiatedBy: string | null;
    options: PickerSlotOption[];
    templateName: string | null;
    providerMessageId?: string | null;
  },
): Promise<void> {
  await admin
    .from("interview_slot_picker_requests")
    .update({ status: "no_response", updated_at: new Date().toISOString() })
    .eq("pipeline_candidate_id", params.pipelineCandidateId)
    .eq("status", "pending");

  const { error } = await admin.from("interview_slot_picker_requests").insert({
    organisation_id: params.organisationId,
    job_id: params.jobId,
    pipeline_candidate_id: params.pipelineCandidateId,
    candidate_id: params.candidateId,
    stage_id: params.stageId,
    initiated_by: params.initiatedBy,
    sent_at: new Date().toISOString(),
    status: "pending",
    slot_options: params.options,
    template_name: params.templateName,
    provider_message_id: params.providerMessageId,
    reminder_sent_at: null,
    no_response_notified_at: null,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    logger.warn("Failed to record slot picker request", {
      pipelineCandidateId: params.pipelineCandidateId,
      error: String(error),
    });
  }
}

export async function markSlotPickerBooked(
  admin: SupabaseClient,
  pipelineCandidateId: string,
): Promise<void> {
  await admin
    .from("interview_slot_picker_requests")
    .update({ status: "booked", updated_at: new Date().toISOString() })
    .eq("pipeline_candidate_id", pipelineCandidateId)
    .eq("status", "pending");
}

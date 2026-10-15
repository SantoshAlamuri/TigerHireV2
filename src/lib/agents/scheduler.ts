import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { withSessionCAS } from "@/lib/whatsapp/sessions";
import { isEnabled } from "@/lib/feature-flags";
import { logger } from "@/lib/observability/logger";
import { buildBookedInviteContext } from "@/lib/interviews/build-booked-invite-context";
import { runBookedInterviewDelivery } from "@/lib/interviews/run-booked-delivery";
import { bookInterviewSlotAtomically } from "@/lib/interviews/book-slot-atomic";
import { resolvePipelineStageInterviewerContact } from "@/lib/interviews/resolve-stage-interviewer-contact";
import {
  materializePickerSlotOptions,
  resolvePickerSlotOptions,
  type PickerSlotOption,
} from "@/lib/interviews/picker-slot-options";
import {
  markSlotPickerBooked,
  recordSlotPickerRequest,
  sendSlotPickerWhatsApp,
} from "@/lib/interviews/slot-picker-whatsapp";

type SlotOption = {
  id: string;
  label: string;
  datetime: string;
  end_at: string | null;
};

function toSessionSlots(options: PickerSlotOption[]): SlotOption[] {
  return options.map((o) => ({
    id: o.id,
    label: o.label,
    datetime: o.datetime,
    end_at: o.end_at,
  }));
}

/**
 * Scheduler Agent: send candidate interview slot options via WhatsApp (Brief 8 Phase C).
 * Prefers slots generated from interviewer_availability_windows, then existing job slots.
 */
export async function triggerSchedulerAgent(input: {
  candidateId: string;
  jobId: string;
  stageId: string;
  initiatedBy?: string | null;
}): Promise<{ status: "scheduled" | "skipped"; reason?: string }> {
  const supabase = createSupabaseAdmin();
  const { data: jobRow } = await supabase
    .from("jobs")
    .select("title, organisation_id, hiring_manager_id")
    .eq("id", input.jobId)
    .maybeSingle();

  const organisationId = (jobRow?.organisation_id as string | null) ?? null;
  if (!(await isEnabled("scheduler_agent", organisationId))) {
    logger.warn("Scheduler agent disabled via feature flag");
    return { status: "skipped", reason: "scheduler_agent_disabled" };
  }

  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, phone, full_name, name")
    .eq("id", input.candidateId)
    .single();

  const { data: stage } = await supabase
    .from("pipeline_stages")
    .select("id, stage_name, interviewer_email, interviewer_name, interviewer_user_id")
    .eq("id", input.stageId)
    .single();

  if (!stage) return { status: "skipped", reason: "no_stage" };
  const interviewerContact = await resolvePipelineStageInterviewerContact(supabase, {
    interviewer_user_id: stage.interviewer_user_id as string | null | undefined,
    interviewer_email: stage.interviewer_email as string | null | undefined,
    interviewer_name: stage.interviewer_name as string | null | undefined,
  });
  if (!candidate?.phone) return { status: "skipped", reason: "no_phone" };

  const jobTitle = (jobRow?.title as string | null)?.trim() || "the role";

  const { data: pipelineCandidate } = await supabase
    .from("pipeline_candidates")
    .select("id")
    .eq("candidate_id", input.candidateId)
    .eq("job_id", input.jobId)
    .maybeSingle();
  const pipelineCandidateId = (pipelineCandidate?.id as string | undefined) ?? undefined;
  if (!pipelineCandidateId) return { status: "skipped", reason: "pipeline_candidate_not_found" };
  if (!organisationId) return { status: "skipped", reason: "no_organisation" };

  let pickerOptions = await resolvePickerSlotOptions(supabase, {
    jobId: input.jobId,
    organisationId,
    stageId: input.stageId,
    interviewerUserId: stage.interviewer_user_id as string | null,
  });

  const slotOwnerUserId =
    (stage.interviewer_user_id as string | null) ??
    (jobRow?.hiring_manager_id as string | null) ??
    input.initiatedBy ??
    null;

  if (slotOwnerUserId && pickerOptions.some((o) => o.source === "window_generated")) {
    pickerOptions = await materializePickerSlotOptions(supabase, {
      jobId: input.jobId,
      userId: slotOwnerUserId,
      options: pickerOptions,
    });
  }

  if (pickerOptions.length === 0) {
    return { status: "skipped", reason: "no_available_slots" };
  }

  const name = (candidate.full_name ?? candidate.name)?.split(" ")[0] ?? "there";
  const slots = toSessionSlots(pickerOptions);

  const sendResult = await sendSlotPickerWhatsApp({
    phone: candidate.phone,
    candidateName: name,
    jobTitle,
    options: pickerOptions,
    applicationId: pipelineCandidateId,
  });

  if (!sendResult.sent) {
    if (sendResult.skipped) {
      logger.info("Slot picker skipped (template not approved or unavailable)", {
        jobId: input.jobId,
        candidateId: input.candidateId,
        error: sendResult.error ?? undefined,
      });
    }
    return {
      status: "skipped",
      reason: sendResult.error ?? "whatsapp_send_failed",
    };
  }

  await recordSlotPickerRequest(supabase, {
    organisationId,
    jobId: input.jobId,
    pipelineCandidateId,
    candidateId: input.candidateId,
    stageId: input.stageId,
    initiatedBy: input.initiatedBy ?? null,
    options: pickerOptions,
    templateName: sendResult.templateName,
    providerMessageId: sendResult.messageId ?? undefined,
  });

  await withSessionCAS(candidate.phone, () => ({
    state: "slot_selection",
    context: {
      slots,
      job_id: input.jobId,
      stage_id: input.stageId,
      pipeline_candidate_id: pipelineCandidateId,
      interviewer_email: interviewerContact.email,
      interviewer_name: interviewerContact.name,
      candidate_id: input.candidateId,
    },
  }));
  return { status: "scheduled" };
}

/**
 * Handle candidate reply (1–N) to confirm slot and update pipeline.
 */
export async function handleSlotSelection(
  phone: string,
  choice: string,
  context: Record<string, unknown>,
): Promise<void> {
  const slots = context.slots as SlotOption[] | undefined;
  const jobId = context.job_id as string;
  const candidateId = context.candidate_id as string;
  const stageId = (context.stage_id as string | undefined) ?? null;

  if (!slots?.length) return;
  const trimmed = choice.trim();
  const idx = parseInt(trimmed, 10) - 1;
  if (!Number.isFinite(idx) || idx < 0 || idx >= slots.length) return;

  const selected = slots[idx];
  if (!selected?.id || !jobId || !candidateId) return;

  const supabase = createSupabaseAdmin();
  let pipelineCandidateId =
    (typeof context.pipeline_candidate_id === "string" ? context.pipeline_candidate_id : null) ??
    null;
  if (!pipelineCandidateId) {
    const { data: pipelineCandidate } = await supabase
      .from("pipeline_candidates")
      .select("id")
      .eq("job_id", jobId)
      .eq("candidate_id", candidateId)
      .maybeSingle();
    pipelineCandidateId = (pipelineCandidate?.id as string | undefined) ?? null;
  }
  if (!pipelineCandidateId) {
    await sendWhatsAppMessage(
      phone,
      "We could not confirm your interview right now. Please reply STATUS and our team will assist.",
    );
    return;
  }

  const booking = await bookInterviewSlotAtomically({
    supabase,
    jobId,
    slotId: selected.id,
    pipelineCandidateId,
  });
  if (!booking.ok) {
    if (
      booking.errorCode === "slot_unavailable" ||
      booking.errorCode === "pipeline_candidate_already_booked"
    ) {
      await sendWhatsAppMessage(
        phone,
        `That slot was just taken. Please reply with a number from 1 to ${slots.length} to choose another option.`,
      );
      return;
    }
    await sendWhatsAppMessage(
      phone,
      "We could not confirm your interview right now. Please try again or reply STATUS.",
    );
    return;
  }

  await markSlotPickerBooked(supabase, pipelineCandidateId);

  const [{ data: candidate }, { data: jobData }, { data: stageData }] = await Promise.all([
    supabase.from("candidates").select("name, email, phone").eq("id", candidateId).maybeSingle(),
    supabase.from("jobs").select("title, organisation_id").eq("id", jobId).maybeSingle(),
    stageId
      ? supabase
          .from("pipeline_stages")
          .select("stage_name, interviewer_email, interviewer_name, interviewer_user_id")
          .eq("id", stageId)
          .eq("job_id", jobId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const slotInterviewer =
    stageData && typeof stageData === "object"
      ? await resolvePipelineStageInterviewerContact(supabase, {
          interviewer_user_id: stageData.interviewer_user_id as string | null | undefined,
          interviewer_email: stageData.interviewer_email as string | null | undefined,
          interviewer_name: stageData.interviewer_name as string | null | undefined,
        })
      : { email: null as string | null, name: null as string | null };

  const inviteCtx = await buildBookedInviteContext(supabase, {
    jobId,
    slotId: selected.id,
    pipelineCandidateId,
    slotUserId: null,
    slotStartAt: booking.startAt,
    slotEndAt: booking.endAt ?? selected.end_at ?? booking.startAt,
    interviewerEmailOverride: slotInterviewer.email,
  });
  if (inviteCtx) {
    await runBookedInterviewDelivery({
      admin: supabase,
      slotId: selected.id,
      organisationId: (jobData?.organisation_id as string | undefined) ?? null,
      ctx: inviteCtx,
    });
  }

  await sendWhatsAppMessage(
    phone,
    `Your interview for ${jobData?.title ?? "the role"} is confirmed for ${selected.label}. Good luck!`,
  );

  const { logPlanSlotBooked } = await import("@/lib/recruitment-plan/plan-stage-dispatch");
  void logPlanSlotBooked({
    jobId,
    candidateId,
    scheduledAt: booking.startAt,
    stageName: (stageData as { stage_name?: string } | null)?.stage_name ?? null,
  });

  await withSessionCAS(phone, () => ({
    state: "complete",
    context: {
      booked_slot_id: selected.id,
      booked_at: new Date().toISOString(),
      interview_scheduled_at: booking.startAt,
    },
  }));
}

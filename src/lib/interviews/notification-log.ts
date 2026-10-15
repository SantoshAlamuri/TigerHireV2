import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import type { InterviewState } from "@/lib/interviews/state-machine";

type AttemptOutcome = "sent" | "suppressed" | "failed";
type AttemptChannel = "email" | "whatsapp" | "ics";
type AttemptRecipient = "candidate" | "interviewer";

export interface InterviewNotificationAttemptInput {
  jobId: string;
  pipelineCandidateId?: string | null;
  candidateId?: string | null;
  fromState: InterviewState;
  toState: InterviewState;
  recipientType: AttemptRecipient;
  channel: AttemptChannel;
  templateVariant: string;
  outcome: AttemptOutcome;
  reasonCode?: string | null;
  reasonDetail?: string | null;
  provider?: string | null;
  providerMessageId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function logInterviewNotificationAttempt(
  input: InterviewNotificationAttemptInput,
): Promise<void> {
  try {
    const admin = createSupabaseAdmin() as any;
    const { error } = await admin.from("interview_notification_attempts").insert({
      job_id: input.jobId,
      pipeline_candidate_id: input.pipelineCandidateId ?? null,
      candidate_id: input.candidateId ?? null,
      from_state: input.fromState,
      to_state: input.toState,
      recipient_type: input.recipientType,
      channel: input.channel,
      template_variant: input.templateVariant,
      outcome: input.outcome,
      reason_code: input.reasonCode ?? null,
      reason_detail: input.reasonDetail ?? null,
      provider: input.provider ?? null,
      provider_message_id: input.providerMessageId ?? null,
      metadata: input.metadata ?? {},
    });
    if (error) {
      logger.warn("Interview notification attempt log insert failed", { error: error.message });
    }
  } catch (err) {
    logger.warn("Interview notification attempt log exception", { error: String(err) });
  }
}

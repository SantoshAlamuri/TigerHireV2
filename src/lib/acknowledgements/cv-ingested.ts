import { logger } from "@/lib/observability/logger";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendApplicationConfirmation } from "@/lib/services/resend";
import { sendApplicationReceivedTemplate } from "@/lib/services/whatsapp";
import { buildAckDedupeKey } from "@/lib/acknowledgements/dedupe";
import { logCandidateAcknowledgementAttempt } from "@/lib/acknowledgements/log";
import { buildCandidateAcknowledgementPlan } from "@/lib/acknowledgements/notifier";
import { hasSentAttemptWithinWindow } from "@/lib/acknowledgements/idempotency";
import { providerSendFailed } from "@/lib/services/send-result";
import type {
  CandidateAcknowledgementAttemptInput,
  CandidateAcknowledgementOutcome,
} from "@/lib/acknowledgements/types";

interface NotifyLoggedInApplyInput {
  applicationId: string;
  candidateId: string;
  jobId: string;
  candidateName: string;
  candidateEmail?: string | null;
  candidatePhone?: string | null;
  jobTitle: string;
  companyName: string;
}

function mapSuppressionOutcome(reasonCode?: string): CandidateAcknowledgementOutcome {
  if (reasonCode === "no_channel") return "suppressed_no_channel";
  if (reasonCode === "no_consent") return "suppressed_no_consent";
  return "suppressed_policy";
}

async function logAttempt(
  input: Omit<CandidateAcknowledgementAttemptInput, "dedupeKey"> & { keySuffix?: string },
) {
  await logCandidateAcknowledgementAttempt({
    ...input,
    dedupeKey: `${buildAckDedupeKey({
      applicationId: input.applicationId,
      candidateId: input.candidateId,
      eventType: input.eventType,
      channel: input.channel,
      templateVariant: input.templateVariant,
    })}${input.keySuffix ? `:${input.keySuffix}` : ""}`,
  });
}

async function sendLegacyEmailOnly(input: NotifyLoggedInApplyInput): Promise<void> {
  if (!input.candidateEmail) return;
  await sendApplicationConfirmation({
    candidateEmail: input.candidateEmail,
    candidateName: input.candidateName,
    jobTitle: input.jobTitle,
    companyName: input.companyName,
  });
}

/**
 * Logged-in apply acknowledgements with dark-launch compatibility:
 * - When centralized notifier is disabled, preserve legacy behavior (email-only).
 * - When enabled, run policy-driven per-channel attempts + durable attempt logging.
 */
export async function notifyCvIngestedFromLoggedInApply(
  input: NotifyLoggedInApplyInput,
): Promise<void> {
  const supabase = createSupabaseAdmin();
  const plan = await buildCandidateAcknowledgementPlan({
    applicationId: input.applicationId,
    candidateId: input.candidateId,
    jobId: input.jobId,
    eventType: "cv_ingested",
    ingestionPath: "logged_in_apply",
    candidateEmail: input.candidateEmail,
    candidatePhone: input.candidatePhone,
    templateVariant: "direct_apply_received",
  });

  if (!plan.enabled) {
    await sendLegacyEmailOnly(input);
    return;
  }

  for (const channelPlan of plan.channels) {
    if (!channelPlan.shouldAttempt) {
      await logAttempt({
        applicationId: input.applicationId,
        candidateId: input.candidateId,
        jobId: input.jobId,
        eventType: "cv_ingested",
        ingestionPath: "logged_in_apply",
        channel: channelPlan.channel,
        templateVariant: "direct_apply_received",
        outcome: mapSuppressionOutcome(channelPlan.suppressionReasonCode),
        reasonCode: channelPlan.suppressionReasonCode ?? null,
        provider: channelPlan.channel === "email" ? "resend" : "meta_whatsapp",
      });
      continue;
    }

    if (channelPlan.channel === "email") {
      const duplicate = await hasSentAttemptWithinWindow({
        supabase,
        applicationId: input.applicationId,
        candidateId: input.candidateId,
        eventType: "cv_ingested",
        channel: "email",
        templateVariant: "direct_apply_received",
      });
      if (duplicate) {
        await logAttempt({
          applicationId: input.applicationId,
          candidateId: input.candidateId,
          jobId: input.jobId,
          eventType: "cv_ingested",
          ingestionPath: "logged_in_apply",
          channel: "email",
          templateVariant: "direct_apply_received",
          outcome: "suppressed_duplicate",
          reasonCode: "duplicate",
          reasonDetail: "Suppressed duplicate acknowledgement attempt within 24h window.",
          provider: "resend",
          keySuffix: "duplicate",
        });
        continue;
      }
      if (!input.candidateEmail) {
        await logAttempt({
          applicationId: input.applicationId,
          candidateId: input.candidateId,
          jobId: input.jobId,
          eventType: "cv_ingested",
          ingestionPath: "logged_in_apply",
          channel: "email",
          templateVariant: "direct_apply_received",
          outcome: "suppressed_no_channel",
          reasonCode: "no_channel",
          provider: "resend",
        });
        continue;
      }
      try {
        const result = await sendApplicationConfirmation({
          candidateEmail: input.candidateEmail,
          candidateName: input.candidateName,
          jobTitle: input.jobTitle,
          companyName: input.companyName,
        });
        if (result.skipped) {
          await logAttempt({
            applicationId: input.applicationId,
            candidateId: input.candidateId,
            jobId: input.jobId,
            eventType: "cv_ingested",
            ingestionPath: "logged_in_apply",
            channel: "email",
            templateVariant: "direct_apply_received",
            outcome:
              result.reason === "email_preference_disabled"
                ? "suppressed_no_consent"
                : "suppressed_policy",
            reasonCode: result.reason,
            provider: "resend",
          });
          continue;
        }
        await logAttempt({
          applicationId: input.applicationId,
          candidateId: input.candidateId,
          jobId: input.jobId,
          eventType: "cv_ingested",
          ingestionPath: "logged_in_apply",
          channel: "email",
          templateVariant: "direct_apply_received",
          outcome: providerSendFailed(result.data) ? "failed_provider" : "sent",
          provider: "resend",
          reasonCode: providerSendFailed(result.data) ? "provider_error" : undefined,
          providerMessageId: (result.data.data as { id?: string } | null | undefined)?.id ?? null,
        });
      } catch (err) {
        await logAttempt({
          applicationId: input.applicationId,
          candidateId: input.candidateId,
          jobId: input.jobId,
          eventType: "cv_ingested",
          ingestionPath: "logged_in_apply",
          channel: "email",
          templateVariant: "direct_apply_received",
          outcome: "failed_provider",
          reasonCode: "provider_error",
          reasonDetail: err instanceof Error ? err.message : String(err),
          provider: "resend",
        });
      }
      continue;
    }

    const duplicate = await hasSentAttemptWithinWindow({
      supabase,
      applicationId: input.applicationId,
      candidateId: input.candidateId,
      eventType: "cv_ingested",
      channel: "whatsapp",
      templateVariant: "direct_apply_received",
    });
    if (duplicate) {
      await logAttempt({
        applicationId: input.applicationId,
        candidateId: input.candidateId,
        jobId: input.jobId,
        eventType: "cv_ingested",
        ingestionPath: "logged_in_apply",
        channel: "whatsapp",
        templateVariant: "direct_apply_received",
        outcome: "suppressed_duplicate",
        reasonCode: "duplicate",
        reasonDetail: "Suppressed duplicate acknowledgement attempt within 24h window.",
        provider: "meta_whatsapp",
        keySuffix: "duplicate",
      });
      continue;
    }

    if (!input.candidatePhone) {
      await logAttempt({
        applicationId: input.applicationId,
        candidateId: input.candidateId,
        jobId: input.jobId,
        eventType: "cv_ingested",
        ingestionPath: "logged_in_apply",
        channel: "whatsapp",
        templateVariant: "direct_apply_received",
        outcome: "suppressed_no_channel",
        reasonCode: "no_channel",
        provider: "meta_whatsapp",
      });
      continue;
    }

    try {
      const wa = await sendApplicationReceivedTemplate({
        phone: input.candidatePhone,
        candidateName: input.candidateName,
        jobTitle: input.jobTitle,
        companyName: input.companyName,
        applicationId: input.applicationId,
      });
      if (!wa.success) {
        await logAttempt({
          applicationId: input.applicationId,
          candidateId: input.candidateId,
          jobId: input.jobId,
          eventType: "cv_ingested",
          ingestionPath: "logged_in_apply",
          channel: "whatsapp",
          templateVariant: "direct_apply_received",
          outcome: "failed_provider",
          reasonCode: "provider_error",
          reasonDetail: wa.error ?? null,
          provider: "meta_whatsapp",
        });
        continue;
      }
      await logAttempt({
        applicationId: input.applicationId,
        candidateId: input.candidateId,
        jobId: input.jobId,
        eventType: "cv_ingested",
        ingestionPath: "logged_in_apply",
        channel: "whatsapp",
        templateVariant: "direct_apply_received",
        outcome: "sent",
        provider: "meta_whatsapp",
        providerMessageId: wa.messageId ?? null,
      });
    } catch (err) {
      await logAttempt({
        applicationId: input.applicationId,
        candidateId: input.candidateId,
        jobId: input.jobId,
        eventType: "cv_ingested",
        ingestionPath: "logged_in_apply",
        channel: "whatsapp",
        templateVariant: "direct_apply_received",
        outcome: "failed_provider",
        reasonCode: "provider_error",
        reasonDetail: err instanceof Error ? err.message : String(err),
        provider: "meta_whatsapp",
      });
    }
  }

  logger.info("Candidate acknowledgement attempts finished", {
    applicationId: input.applicationId,
    candidateId: input.candidateId,
    jobId: input.jobId,
    ingestionPath: "logged_in_apply",
  });
}

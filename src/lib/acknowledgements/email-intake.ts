import { providerSendFailed } from "@/lib/services/send-result";
import { logger } from "@/lib/observability/logger";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { ConsentService } from "@/lib/services/ConsentService";
import { sendEmailIntakeAcknowledgement } from "@/lib/services/resend";
import { buildAckDedupeKey } from "@/lib/acknowledgements/dedupe";
import { hasSentAttemptWithinWindow } from "@/lib/acknowledgements/idempotency";
import { logCandidateAcknowledgementAttempt } from "@/lib/acknowledgements/log";
import { buildCandidateAcknowledgementPlan } from "@/lib/acknowledgements/notifier";
import type { CandidateAcknowledgementAttemptInput } from "@/lib/acknowledgements/types";

const TEMPLATE_VARIANT = "email_intake_received";

interface NotifyEmailIntakeInput {
  applicationId?: string | null;
  candidateId: string;
  candidateName?: string | null;
  candidatePhone?: string | null;
  candidateEmail?: string | null;
  jobId?: string | null;
  jobTitle?: string | null;
  companyName?: string | null;
}

function firstName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0] || "there";
}

function mapSuppressionOutcome(
  code: string | undefined,
): CandidateAcknowledgementAttemptInput["outcome"] {
  if (code === "no_channel") return "suppressed_no_channel";
  if (code === "no_consent") return "suppressed_no_consent";
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

export async function notifyCvIngestedFromEmailIntake(
  input: NotifyEmailIntakeInput,
): Promise<void> {
  const supabase = createSupabaseAdmin();
  const phoneRaw = input.candidatePhone?.trim() ?? null;
  const hasWhatsAppConsent = phoneRaw
    ? await ConsentService.hasRequiredConsent(supabase, phoneRaw).catch(() => false)
    : null;
  const plan = await buildCandidateAcknowledgementPlan({
    applicationId: input.applicationId ?? null,
    candidateId: input.candidateId,
    jobId: input.jobId ?? null,
    eventType: "cv_ingested",
    ingestionPath: "email_intake",
    candidateEmail: input.candidateEmail ?? null,
    candidatePhone: phoneRaw,
    emailConsent: true,
    whatsappConsent: hasWhatsAppConsent,
    templateVariant: TEMPLATE_VARIANT,
  });

  if (!plan.enabled) {
    for (const channelPlan of plan.channels) {
      await logAttempt({
        applicationId: input.applicationId ?? null,
        candidateId: input.candidateId,
        jobId: input.jobId ?? null,
        eventType: "cv_ingested",
        ingestionPath: "email_intake",
        channel: channelPlan.channel,
        templateVariant: TEMPLATE_VARIANT,
        outcome: mapSuppressionOutcome(channelPlan.suppressionReasonCode),
        reasonCode: channelPlan.suppressionReasonCode ?? null,
        provider: channelPlan.channel === "email" ? "resend" : "meta_whatsapp",
      });
    }
    return;
  }

  const companyName = (input.companyName ?? "").trim() || "the hiring team";
  const jobTitle = (input.jobTitle ?? "").trim() || "the role";
  const candidateName = (input.candidateName ?? "").trim() || "there";

  for (const channelPlan of plan.channels) {
    if (!channelPlan.shouldAttempt) {
      await logAttempt({
        applicationId: input.applicationId ?? null,
        candidateId: input.candidateId,
        jobId: input.jobId ?? null,
        eventType: "cv_ingested",
        ingestionPath: "email_intake",
        channel: channelPlan.channel,
        templateVariant: TEMPLATE_VARIANT,
        outcome: mapSuppressionOutcome(channelPlan.suppressionReasonCode),
        reasonCode: channelPlan.suppressionReasonCode ?? null,
        provider: channelPlan.channel === "email" ? "resend" : "meta_whatsapp",
      });
      continue;
    }

    const duplicate = await hasSentAttemptWithinWindow({
      supabase,
      applicationId: input.applicationId ?? null,
      candidateId: input.candidateId,
      eventType: "cv_ingested",
      channel: channelPlan.channel,
      templateVariant: TEMPLATE_VARIANT,
    });
    if (duplicate) {
      await logAttempt({
        applicationId: input.applicationId ?? null,
        candidateId: input.candidateId,
        jobId: input.jobId ?? null,
        eventType: "cv_ingested",
        ingestionPath: "email_intake",
        channel: channelPlan.channel,
        templateVariant: TEMPLATE_VARIANT,
        outcome: "suppressed_duplicate",
        reasonCode: "duplicate",
        reasonDetail: "Suppressed duplicate acknowledgement attempt within 24h window.",
        provider: channelPlan.channel === "email" ? "resend" : "meta_whatsapp",
        keySuffix: "duplicate",
      });
      continue;
    }

    if (channelPlan.channel === "email") {
      try {
        const result = await sendEmailIntakeAcknowledgement({
          candidateEmail: input.candidateEmail!,
          candidateName,
          jobTitle,
          companyName,
        });
        if (result.skipped) {
          await logAttempt({
            applicationId: input.applicationId ?? null,
            candidateId: input.candidateId,
            jobId: input.jobId ?? null,
            eventType: "cv_ingested",
            ingestionPath: "email_intake",
            channel: "email",
            templateVariant: TEMPLATE_VARIANT,
            outcome: "suppressed_no_consent",
            reasonCode: result.reason,
            provider: "resend",
          });
        } else {
          await logAttempt({
            applicationId: input.applicationId ?? null,
            candidateId: input.candidateId,
            jobId: input.jobId ?? null,
            eventType: "cv_ingested",
            ingestionPath: "email_intake",
            channel: "email",
            templateVariant: TEMPLATE_VARIANT,
            outcome: providerSendFailed(result.data) ? "failed_provider" : "sent",
            provider: "resend",
            reasonCode: providerSendFailed(result.data) ? "provider_error" : undefined,
            providerMessageId: (result.data.data as { id?: string } | null | undefined)?.id ?? null,
          });
        }
      } catch (err) {
        await logAttempt({
          applicationId: input.applicationId ?? null,
          candidateId: input.candidateId,
          jobId: input.jobId ?? null,
          eventType: "cv_ingested",
          ingestionPath: "email_intake",
          channel: "email",
          templateVariant: TEMPLATE_VARIANT,
          outcome: "failed_provider",
          reasonCode: "provider_error",
          reasonDetail: err instanceof Error ? err.message : String(err),
          provider: "resend",
        });
      }
      continue;
    }

    try {
      const wa = await sendWhatsAppMessage(
        phoneRaw!,
        `Hi ${firstName(candidateName)}, we received your profile by email for ${jobTitle} at ${companyName}. ` +
          "We will share updates if there is a fit. Reply STOP anytime to opt out of WhatsApp updates.",
      );
      if (!wa.success) {
        await logAttempt({
          applicationId: input.applicationId ?? null,
          candidateId: input.candidateId,
          jobId: input.jobId ?? null,
          eventType: "cv_ingested",
          ingestionPath: "email_intake",
          channel: "whatsapp",
          templateVariant: TEMPLATE_VARIANT,
          outcome: "failed_provider",
          reasonCode: "provider_error",
          reasonDetail: wa.error ?? null,
          provider: "meta_whatsapp",
        });
      } else {
        await logAttempt({
          applicationId: input.applicationId ?? null,
          candidateId: input.candidateId,
          jobId: input.jobId ?? null,
          eventType: "cv_ingested",
          ingestionPath: "email_intake",
          channel: "whatsapp",
          templateVariant: TEMPLATE_VARIANT,
          outcome: "sent",
          provider: "meta_whatsapp",
          providerMessageId: wa.messageId ?? null,
        });
      }
    } catch (err) {
      await logAttempt({
        applicationId: input.applicationId ?? null,
        candidateId: input.candidateId,
        jobId: input.jobId ?? null,
        eventType: "cv_ingested",
        ingestionPath: "email_intake",
        channel: "whatsapp",
        templateVariant: TEMPLATE_VARIANT,
        outcome: "failed_provider",
        reasonCode: "provider_error",
        reasonDetail: err instanceof Error ? err.message : String(err),
        provider: "meta_whatsapp",
      });
    }
  }

  logger.info("Candidate acknowledgement attempts finished", {
    applicationId: input.applicationId ?? null,
    candidateId: input.candidateId,
    jobId: input.jobId ?? null,
    ingestionPath: "email_intake",
    templateVariant: TEMPLATE_VARIANT,
  });
}

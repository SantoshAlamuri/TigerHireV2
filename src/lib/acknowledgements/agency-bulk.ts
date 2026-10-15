import { logger } from "@/lib/observability/logger";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { ConsentService } from "@/lib/services/ConsentService";
import { buildAckDedupeKey } from "@/lib/acknowledgements/dedupe";
import { hasSentAttemptWithinWindow } from "@/lib/acknowledgements/idempotency";
import { logCandidateAcknowledgementAttempt } from "@/lib/acknowledgements/log";
import { buildCandidateAcknowledgementPlan } from "@/lib/acknowledgements/notifier";
import { ACK_FLAG_KEYS } from "@/lib/acknowledgements/flags";
import { isEnabled } from "@/lib/feature-flags";
import type { CandidateAcknowledgementAttemptInput } from "@/lib/acknowledgements/types";

const TEMPLATE_VARIANT = "agency_bulk_shared_profile";

interface NotifyAgencyBulkInput {
  applicationId?: string | null;
  candidateId: string;
  candidateName?: string | null;
  candidatePhone?: string | null;
  candidateEmail?: string | null;
  jobId?: string | null;
  jobTitle?: string | null;
  companyName?: string | null;
  agencyName?: string | null;
}

function firstName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0] || "there";
}

function sanitizeAgencyName(name: string | null | undefined): string | null {
  const trimmed = (name ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (trimmed.length < 3 || trimmed.length > 80) return null;
  if (!/[A-Za-z0-9]/.test(trimmed)) return null;
  if (/^agency$/i.test(trimmed)) return null;
  return trimmed;
}

function buildAgencyBulkMessage(input: {
  candidateName?: string | null;
  agencyName: string;
  companyName: string;
  jobTitle?: string | null;
}): string {
  const roleClause = input.jobTitle?.trim() ? ` for ${input.jobTitle.trim()}` : "";
  return (
    `Hi ${firstName(input.candidateName)}, ${input.agencyName} has shared your profile with ${input.companyName}${roleClause}. ` +
    "TigerHire will share updates if there is a fit. Reply STOP anytime to opt out of WhatsApp updates."
  );
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

export async function notifyCvIngestedFromAgencyBulk(input: NotifyAgencyBulkInput): Promise<void> {
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
    ingestionPath: "agency_bulk",
    candidateEmail: input.candidateEmail ?? null,
    candidatePhone: phoneRaw,
    emailConsent: false,
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
        ingestionPath: "agency_bulk",
        channel: channelPlan.channel,
        templateVariant: TEMPLATE_VARIANT,
        outcome: mapSuppressionOutcome(channelPlan.suppressionReasonCode),
        reasonCode: channelPlan.suppressionReasonCode ?? null,
        provider: channelPlan.channel === "email" ? "resend" : "meta_whatsapp",
      });
    }
    return;
  }

  const agencyName = sanitizeAgencyName(input.agencyName);
  const companyName = (input.companyName ?? "").trim() || "the hiring company";

  for (const channelPlan of plan.channels) {
    if (channelPlan.channel === "email") {
      await logAttempt({
        applicationId: input.applicationId ?? null,
        candidateId: input.candidateId,
        jobId: input.jobId ?? null,
        eventType: "cv_ingested",
        ingestionPath: "agency_bulk",
        channel: "email",
        templateVariant: TEMPLATE_VARIANT,
        outcome: "suppressed_policy",
        reasonCode: "path_policy_email_disabled",
        reasonDetail: "Agency bulk acknowledgements are WhatsApp-only in PR-4.",
        provider: "resend",
      });
      continue;
    }

    if (!channelPlan.shouldAttempt) {
      await logAttempt({
        applicationId: input.applicationId ?? null,
        candidateId: input.candidateId,
        jobId: input.jobId ?? null,
        eventType: "cv_ingested",
        ingestionPath: "agency_bulk",
        channel: "whatsapp",
        templateVariant: TEMPLATE_VARIANT,
        outcome: mapSuppressionOutcome(channelPlan.suppressionReasonCode),
        reasonCode: channelPlan.suppressionReasonCode ?? null,
        provider: "meta_whatsapp",
      });
      continue;
    }

    if (!agencyName) {
      await logAttempt({
        applicationId: input.applicationId ?? null,
        candidateId: input.candidateId,
        jobId: input.jobId ?? null,
        eventType: "cv_ingested",
        ingestionPath: "agency_bulk",
        channel: "whatsapp",
        templateVariant: TEMPLATE_VARIANT,
        outcome: "suppressed_policy",
        reasonCode: "invalid_source_attribution",
        reasonDetail: "Agency name missing or malformed; suppressing to avoid wrong attribution.",
        provider: "meta_whatsapp",
      });
      continue;
    }

    const duplicate = await hasSentAttemptWithinWindow({
      supabase,
      applicationId: input.applicationId ?? null,
      candidateId: input.candidateId,
      eventType: "cv_ingested",
      channel: "whatsapp",
      templateVariant: TEMPLATE_VARIANT,
    });
    if (duplicate) {
      await logAttempt({
        applicationId: input.applicationId ?? null,
        candidateId: input.candidateId,
        jobId: input.jobId ?? null,
        eventType: "cv_ingested",
        ingestionPath: "agency_bulk",
        channel: "whatsapp",
        templateVariant: TEMPLATE_VARIANT,
        outcome: "suppressed_duplicate",
        reasonCode: "duplicate",
        reasonDetail: "Suppressed duplicate acknowledgement attempt within 24h window.",
        provider: "meta_whatsapp",
        keySuffix: "duplicate",
      });
      continue;
    }

    const message = buildAgencyBulkMessage({
      candidateName: input.candidateName,
      agencyName,
      companyName,
      jobTitle: input.jobTitle,
    });

    const pathStillEnabled = await isEnabled(ACK_FLAG_KEYS.pathAgencyBulkEnabled);
    if (!pathStillEnabled) {
      await logAttempt({
        applicationId: input.applicationId ?? null,
        candidateId: input.candidateId,
        jobId: input.jobId ?? null,
        eventType: "cv_ingested",
        ingestionPath: "agency_bulk",
        channel: "whatsapp",
        templateVariant: TEMPLATE_VARIANT,
        outcome: "suppressed_policy",
        reasonCode: "ingestion_path_disabled",
        provider: "meta_whatsapp",
      });
      continue;
    }

    try {
      const wa = await sendWhatsAppMessage(phoneRaw!, message);
      if (!wa.success) {
        await logAttempt({
          applicationId: input.applicationId ?? null,
          candidateId: input.candidateId,
          jobId: input.jobId ?? null,
          eventType: "cv_ingested",
          ingestionPath: "agency_bulk",
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
          ingestionPath: "agency_bulk",
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
        ingestionPath: "agency_bulk",
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
    candidateId: input.candidateId,
    jobId: input.jobId ?? null,
    ingestionPath: "agency_bulk",
    templateVariant: TEMPLATE_VARIANT,
  });
}

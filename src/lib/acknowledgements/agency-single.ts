import { logger } from "@/lib/observability/logger";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { ConsentService } from "@/lib/services/ConsentService";
import { buildAckDedupeKey } from "@/lib/acknowledgements/dedupe";
import { hasSentAttemptWithinWindow } from "@/lib/acknowledgements/idempotency";
import { logCandidateAcknowledgementAttempt } from "@/lib/acknowledgements/log";
import { buildCandidateAcknowledgementPlan } from "@/lib/acknowledgements/notifier";
import { sendPostApplyCandidatePortalNudge } from "@/lib/agents/public-apply";
import type { CandidateAcknowledgementAttemptInput } from "@/lib/acknowledgements/types";

const TEMPLATE_VARIANT = "agency_shared_profile";

export const AGENCY_SHARED_PROFILE_COPY_PACK = {
  templateVariant: TEMPLATE_VARIANT,
  channel: "whatsapp" as const,
  status: "pending_signoff" as const,
  approvedBy: null as string | null,
  approvedAt: null as string | null,
  reviewedAt: "2026-04-28",
} as const;

interface NotifyAgencySingleInput {
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
  const token = trimmed.split(/\s+/)[0];
  return token || "there";
}

function sanitizeAgencyName(name: string | null | undefined): string | null {
  const trimmed = (name ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (trimmed.length < 3 || trimmed.length > 80) return null;
  if (!/[A-Za-z0-9]/.test(trimmed)) return null;
  if (/^agency$/i.test(trimmed)) return null;
  return trimmed;
}

function buildAgencySharedProfileMessage(input: {
  candidateName: string | null | undefined;
  agencyName: string;
  companyName: string;
  jobTitle?: string | null;
}): string {
  const cFirst = firstName(input.candidateName);
  const roleClause = input.jobTitle?.trim() ? ` for ${input.jobTitle.trim()}` : "";
  return (
    `Hi ${cFirst}, ${input.agencyName} has shared your profile with ${input.companyName}${roleClause}. ` +
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

export async function notifyCvIngestedFromAgencySingle(
  input: NotifyAgencySingleInput,
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
    ingestionPath: "agency_single",
    candidateEmail: input.candidateEmail ?? null,
    candidatePhone: phoneRaw,
    emailConsent: false,
    whatsappConsent: hasWhatsAppConsent,
    templateVariant: TEMPLATE_VARIANT,
    metadata: {
      copyPack: AGENCY_SHARED_PROFILE_COPY_PACK,
    },
  });

  if (!plan.enabled) {
    await sendPostApplyCandidatePortalNudge(
      supabase,
      { phone: phoneRaw ?? undefined, jobId: input.jobId ?? undefined, whatsappOptIn: undefined },
      input.candidateId,
      input.candidateName ?? null,
    );
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
        ingestionPath: "agency_single",
        channel: "email",
        templateVariant: TEMPLATE_VARIANT,
        outcome: "suppressed_policy",
        reasonCode: "path_policy_email_disabled",
        reasonDetail: "Agency single acknowledgements are WhatsApp-only in PR-3.",
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
        ingestionPath: "agency_single",
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
        ingestionPath: "agency_single",
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
        ingestionPath: "agency_single",
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

    if (!phoneRaw) {
      await logAttempt({
        applicationId: input.applicationId ?? null,
        candidateId: input.candidateId,
        jobId: input.jobId ?? null,
        eventType: "cv_ingested",
        ingestionPath: "agency_single",
        channel: "whatsapp",
        templateVariant: TEMPLATE_VARIANT,
        outcome: "suppressed_no_channel",
        reasonCode: "no_channel",
        provider: "meta_whatsapp",
      });
      continue;
    }

    const message = buildAgencySharedProfileMessage({
      candidateName: input.candidateName ?? null,
      agencyName,
      companyName,
      jobTitle: input.jobTitle ?? null,
    });

    try {
      const wa = await sendWhatsAppMessage(phoneRaw, message);
      if (!wa.success) {
        await logAttempt({
          applicationId: input.applicationId ?? null,
          candidateId: input.candidateId,
          jobId: input.jobId ?? null,
          eventType: "cv_ingested",
          ingestionPath: "agency_single",
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
          ingestionPath: "agency_single",
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
        ingestionPath: "agency_single",
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
    ingestionPath: "agency_single",
    templateVariant: TEMPLATE_VARIANT,
    copyPackStatus: AGENCY_SHARED_PROFILE_COPY_PACK.status,
  });
}

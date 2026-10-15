import { env } from "@/lib/config/env";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { sendTemplateMessage } from "@/lib/services/whatsapp";

/**
 * Outbound gating: `sendTemplateMessage` → `postMetaMessage` respects production hold when
 * `OUTBOUND_NOTIFICATIONS_ENABLED` is not `true` (`env.isProductionOutboundHold`), plus
 * `WHATSAPP_MODE=sandbox` and Meta credentials.
 */

// TODO(Meta / WhatsApp Business): th_referrer_offer_update + th_referrer_rejection_update must be
//   created & approved in Meta before these sends deliver (operator step — cannot be done from code).
//   Full submission table + copy: docs/ops/integration-golive-runbooks.md → "WhatsApp templates".
//   Bodies are already defined in scripts/create-whatsapp-templates.ts (v1 names used here) and
//   scripts/submit-whatsapp-templates-v2.mjs (improved *_v2 copy under NEW names — switching to v2
//   requires changing the constants below). Variable order = bodyParams below:
//   th_referrer_offer_update: {{1}} candidate first name, {{2}} job title, {{3}} company, {{4}} bounty (INR or "pending")
//   th_referrer_rejection_update: {{1}} candidate first name, {{2}} job title

/** Template name in Meta WhatsApp Manager (Cloud API, same path as th_referrer_vouch_request). */
const TEMPLATE_REFERRER_OFFER_UPDATE = "th_referrer_offer_update";
const TEMPLATE_REFERRER_REJECTION_UPDATE = "th_referrer_rejection_update";

function firstNameFromCandidate(
  fullName: string | null | undefined,
  name: string | null | undefined,
): string {
  const raw = (fullName ?? name ?? "Candidate").trim() || "Candidate";
  const token = raw.split(/\s+/).filter(Boolean)[0];
  return token || "Candidate";
}

function formatBountyInr(amount: unknown): string {
  const n = typeof amount === "string" ? Number(amount) : Number(amount);
  if (!Number.isFinite(n) || n <= 0) return "pending";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

type ReferrerNotificationLogRow = {
  channel: string;
  template_name: string;
  referrer_id: string;
  application_id: string;
  body_params: string[];
  send_success: boolean;
  send_error: string | null;
  outbound_hold: boolean;
  whatsapp_sandbox: boolean;
  outbound_notifications_enabled: boolean;
};

async function tryInsertNotificationsLog(row: ReferrerNotificationLogRow): Promise<void> {
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("notifications_log").insert(row);
  if (error) {
    console.info("[referrer-notification] notifications_log insert skipped or failed", {
      ...row,
      supabaseMessage: error.message,
    });
  }
}

/**
 * Outbound WhatsApp to referrers when a referred candidate reaches offer (hired) or rejection.
 * Uses the same Meta WhatsApp Cloud API path as other templates (`sendTemplateMessage` in
 * `src/lib/services/whatsapp.ts`), which already respects `OUTBOUND_NOTIFICATIONS_ENABLED` on
 * production (`env.isProductionOutboundHold`), `WHATSAPP_MODE=sandbox`, and Meta credentials.
 * Never throws.
 */
export async function sendReferrerOfferNotification(
  referrerId: string,
  applicationId: string,
): Promise<void> {
  try {
    const admin = createSupabaseAdmin();

    const { data: app, error: appErr } = await admin
      .from("applications")
      .select("id, direct_referrer_id, candidate_id, job_id")
      .eq("id", applicationId)
      .maybeSingle();

    if (appErr || !app) {
      logger.warn("sendReferrerOfferNotification: application load failed", {
        applicationId,
        error: appErr?.message,
      });
      return;
    }
    if ((app.direct_referrer_id as string | null) !== referrerId) {
      logger.warn("sendReferrerOfferNotification: referrer mismatch", {
        applicationId,
        referrerId,
      });
      return;
    }

    const [
      { data: referrer, error: refErr },
      { data: candidate, error: candErr },
      { data: job, error: jobErr },
    ] = await Promise.all([
      admin.from("referrers").select("id, whatsapp_number").eq("id", referrerId).maybeSingle(),
      admin
        .from("candidates")
        .select("full_name, name")
        .eq("id", app.candidate_id as string)
        .maybeSingle(),
      admin
        .from("jobs")
        .select("title, organisation_id")
        .eq("id", app.job_id as string)
        .maybeSingle(),
    ]);

    if (refErr || !referrer?.whatsapp_number) {
      logger.warn("sendReferrerOfferNotification: referrer or WhatsApp missing", {
        referrerId,
        error: refErr?.message,
      });
      return;
    }
    if (candErr || !candidate) {
      logger.warn("sendReferrerOfferNotification: candidate load failed", {
        applicationId,
        error: candErr?.message,
      });
      return;
    }
    if (jobErr || !job) {
      logger.warn("sendReferrerOfferNotification: job load failed", {
        applicationId,
        error: jobErr?.message,
      });
      return;
    }

    const { data: org } = job.organisation_id
      ? await admin
          .from("organisations")
          .select("name")
          .eq("id", job.organisation_id as string)
          .maybeSingle()
      : { data: null };

    const { data: refConfig } = await admin
      .from("job_referral_config")
      .select("direct_bonus_amount")
      .eq("job_id", app.job_id as string)
      .maybeSingle();

    const candidateFirst = firstNameFromCandidate(
      candidate.full_name as string | null | undefined,
      candidate.name as string | null | undefined,
    );
    const jobTitle = (job.title as string | null)?.trim() || "Role";
    const companyName = (org?.name as string | null)?.trim() || "Company";
    const bounty = formatBountyInr(refConfig?.direct_bonus_amount);

    const bodyParams = [candidateFirst, jobTitle, companyName, bounty];

    const result = await sendTemplateMessage({
      phoneNumber: referrer.whatsapp_number as string,
      templateName: TEMPLATE_REFERRER_OFFER_UPDATE,
      languageCode: "en",
      bodyParams,
      applicationId,
    });

    logger.info("sendReferrerOfferNotification: template finished", {
      referrerId,
      applicationId,
      template: TEMPLATE_REFERRER_OFFER_UPDATE,
      success: result.success,
      error: result.error,
    });

    await tryInsertNotificationsLog({
      channel: "whatsapp",
      template_name: TEMPLATE_REFERRER_OFFER_UPDATE,
      referrer_id: referrerId,
      application_id: applicationId,
      body_params: bodyParams,
      send_success: result.success,
      send_error: result.error ?? null,
      outbound_hold: env.isProductionOutboundHold,
      whatsapp_sandbox: env.whatsappSandbox,
      outbound_notifications_enabled: env.outboundNotificationsEnabled,
    });
  } catch (err) {
    logger.warn("sendReferrerOfferNotification: unexpected error", {
      referrerId,
      applicationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** @see sendReferrerOfferNotification — same outbound / logging rules. */
export async function sendReferrerRejectionNotification(
  referrerId: string,
  applicationId: string,
): Promise<void> {
  try {
    const admin = createSupabaseAdmin();

    const { data: app, error: appErr } = await admin
      .from("applications")
      .select("id, direct_referrer_id, candidate_id, job_id")
      .eq("id", applicationId)
      .maybeSingle();

    if (appErr || !app) {
      logger.warn("sendReferrerRejectionNotification: application load failed", {
        applicationId,
        error: appErr?.message,
      });
      return;
    }
    if ((app.direct_referrer_id as string | null) !== referrerId) {
      logger.warn("sendReferrerRejectionNotification: referrer mismatch", {
        applicationId,
        referrerId,
      });
      return;
    }

    const [
      { data: referrer, error: refErr },
      { data: candidate, error: candErr },
      { data: job, error: jobErr },
    ] = await Promise.all([
      admin.from("referrers").select("id, whatsapp_number").eq("id", referrerId).maybeSingle(),
      admin
        .from("candidates")
        .select("full_name, name")
        .eq("id", app.candidate_id as string)
        .maybeSingle(),
      admin
        .from("jobs")
        .select("title")
        .eq("id", app.job_id as string)
        .maybeSingle(),
    ]);

    if (refErr || !referrer?.whatsapp_number) {
      logger.warn("sendReferrerRejectionNotification: referrer or WhatsApp missing", {
        referrerId,
        error: refErr?.message,
      });
      return;
    }
    if (candErr || !candidate) {
      logger.warn("sendReferrerRejectionNotification: candidate load failed", {
        applicationId,
        error: candErr?.message,
      });
      return;
    }
    if (jobErr || !job) {
      logger.warn("sendReferrerRejectionNotification: job load failed", {
        applicationId,
        error: jobErr?.message,
      });
      return;
    }

    const candidateFirst = firstNameFromCandidate(
      candidate.full_name as string | null | undefined,
      candidate.name as string | null | undefined,
    );
    const jobTitle = (job.title as string | null)?.trim() || "Role";
    const bodyParams = [candidateFirst, jobTitle];

    const result = await sendTemplateMessage({
      phoneNumber: referrer.whatsapp_number as string,
      templateName: TEMPLATE_REFERRER_REJECTION_UPDATE,
      languageCode: "en",
      bodyParams,
      applicationId,
    });

    logger.info("sendReferrerRejectionNotification: template finished", {
      referrerId,
      applicationId,
      template: TEMPLATE_REFERRER_REJECTION_UPDATE,
      success: result.success,
      error: result.error,
    });

    await tryInsertNotificationsLog({
      channel: "whatsapp",
      template_name: TEMPLATE_REFERRER_REJECTION_UPDATE,
      referrer_id: referrerId,
      application_id: applicationId,
      body_params: bodyParams,
      send_success: result.success,
      send_error: result.error ?? null,
      outbound_hold: env.isProductionOutboundHold,
      whatsapp_sandbox: env.whatsappSandbox,
      outbound_notifications_enabled: env.outboundNotificationsEnabled,
    });
  } catch (err) {
    logger.warn("sendReferrerRejectionNotification: unexpected error", {
      referrerId,
      applicationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

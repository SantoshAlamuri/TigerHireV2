import type { SupabaseClient } from "@supabase/supabase-js";
import { ConsentRepository } from "@/lib/repositories/ConsentRepository";
import { SessionRepository } from "@/lib/repositories/SessionRepository";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { hasRecentInboundFromPhone } from "@/lib/whatsapp/message-log";
import { normalizeIndianPhone } from "@/lib/whatsapp/normalize-phone";
import {
  getWhatsAppTemplateCategory,
  isMarketingWhatsAppTemplate,
} from "@/lib/whatsapp/template-categories";
import { getTemplateStatus } from "@/lib/whatsapp/template-status-store";
import { isPhoneOptedOut } from "@/lib/whatsapp/opt-out";

export type WhatsAppSendPurpose =
  | "first_contact"
  | "consent_request"
  | "transactional"
  | "marketing"
  | "session_text"
  | "authentication";

export type CanSendWhatsAppResult = {
  allowed: boolean;
  channel?: string;
  error?: string;
  reason?: string;
};

const INDIAN_MOBILE_RE = /^91[6-9]\d{9}$/;

async function hasActiveWhatsAppSession(
  supabase: SupabaseClient,
  phoneDigits: string,
): Promise<boolean> {
  const recentInbound = await hasRecentInboundFromPhone(supabase, phoneDigits, 24);
  if (recentInbound) return true;
  return SessionRepository.hasOptedIn(supabase, phoneDigits);
}

async function checkMarketingEligibility(
  supabase: SupabaseClient,
  phoneDigits: string,
  templateName?: string,
): Promise<CanSendWhatsAppResult> {
  const hasConsent = await ConsentRepository.hasAllRequiredConsent(supabase, phoneDigits);
  if (!hasConsent) {
    if (templateName) {
      logger.info("metric.whatsapp_marketing_blocked_no_consent", {
        template_name: templateName,
        phone_len: phoneDigits.length,
      });
    }
    return {
      allowed: false,
      error: "marketing_requires_consent",
      reason: "marketing_requires_consent",
    };
  }

  const hasSession = await hasActiveWhatsAppSession(supabase, phoneDigits);
  if (!hasSession) {
    return {
      allowed: false,
      error:
        "Recipient has not opted in (no recent inbound and no prior session). Marketing will not be delivered.",
      reason: "marketing_requires_session",
    };
  }

  return { allowed: true, channel: "template" };
}

/**
 * Central outbound gate for WhatsApp sends (templates and session text).
 * MARKETING templates are blocked on cold numbers even when purpose is misclassified.
 */
export async function canSendWhatsApp(input: {
  phone: string;
  purpose: WhatsAppSendPurpose;
  templateName?: string;
  supabase?: SupabaseClient;
  /**
   * Bypass the do-not-contact gate. ONLY for the STOP confirmation itself
   * ("you have been removed…"); every other send to an opted-out phone is blocked.
   */
  allowOptedOut?: boolean;
}): Promise<CanSendWhatsAppResult> {
  const normalized = normalizeIndianPhone(input.phone);
  if (!INDIAN_MOBILE_RE.test(normalized)) {
    return { allowed: false, error: "invalid_phone", reason: "invalid_phone" };
  }

  const supabase = input.supabase ?? createSupabaseAdmin();
  const { purpose, templateName } = input;

  // Do-not-contact gate: once a candidate texts STOP (candidates.do_not_call /
  // whatsapp_sessions state "opted_out"), no automated send may go out on this
  // number. Exceptions: the STOP confirmation itself (allowOptedOut) and
  // user-initiated authentication OTPs (the recipient just asked for the code;
  // blocking would lock referrers out of login with no recovery path).
  const templateCategory = templateName ? getWhatsAppTemplateCategory(templateName) : null;
  const isAuthenticationSend =
    purpose === "authentication" || templateCategory === "AUTHENTICATION";
  if (!input.allowOptedOut && !isAuthenticationSend) {
    if (await isPhoneOptedOut(supabase, normalized)) {
      logger.info("whatsapp_send_blocked_opted_out", {
        phone_len: normalized.length,
        purpose,
        template_name: templateName,
      });
      return {
        allowed: false,
        error: "recipient_opted_out",
        reason: "recipient_opted_out",
      };
    }
  }

  // Short-circuit on REJECTED / PAUSED / DISABLED templates. If Meta flagged
  // a template, every send returns an error rather than being delivered; for
  // OTP / authentication flows the user sees "WhatsApp send failed" while we
  // already inserted into our own state (referrer_otp etc.). Reading the
  // approval state up front lets us fail closed and switch to fallback paths
  // (e.g. session text or SMS) without burning Meta API quota first.
  if (templateName) {
    try {
      const status = await getTemplateStatus(supabase, templateName);
      if (status && status.status !== "APPROVED") {
        logger.warn("whatsapp_template_send_blocked_not_approved", {
          template_name: templateName,
          template_status: status.status,
          rejection_reason: status.rejection_reason,
        });
        return {
          allowed: false,
          error: "template_not_approved",
          reason: "template_not_approved",
        };
      }
    } catch (err) {
      // Fail open on a transient DB lookup error — the existing flow already
      // tolerates an unknown template state, and a blanket block on DB hiccups
      // would take down OTP / interview-reminder flows during minor incidents.
      logger.warn("whatsapp_template_status_lookup_failed", {
        template_name: templateName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (templateName) {
    if (templateCategory === "AUTHENTICATION") {
      return { allowed: true, channel: "template" };
    }
    if (templateCategory === "MARKETING") {
      return checkMarketingEligibility(supabase, normalized, templateName);
    }
  }

  if (purpose === "authentication") {
    return { allowed: true, channel: "template" };
  }

  if (purpose === "session_text") {
    const hasSession = await hasActiveWhatsAppSession(supabase, normalized);
    if (!hasSession) {
      return {
        allowed: false,
        error: "session_window_closed",
        reason: "session_window_closed",
      };
    }
    return { allowed: true, channel: "session" };
  }

  if (purpose === "marketing") {
    return checkMarketingEligibility(supabase, normalized, templateName);
  }

  if (purpose === "first_contact" || purpose === "consent_request" || purpose === "transactional") {
    if (templateName && getWhatsAppTemplateCategory(templateName) !== "UTILITY") {
      return {
        allowed: false,
        error: "template_category_not_allowed",
        reason: "template_category_not_allowed",
      };
    }
    return { allowed: true, channel: templateName ? "template" : undefined };
  }

  return { allowed: false, error: "unknown_purpose", reason: "unknown_purpose" };
}

/** Convenience for callers that only have a template name. */
export function inferPurposeFromTemplate(templateName: string): WhatsAppSendPurpose {
  const category = getWhatsAppTemplateCategory(templateName);
  if (category === "AUTHENTICATION") return "authentication";
  if (category === "MARKETING" || isMarketingWhatsAppTemplate(templateName)) return "marketing";
  return "transactional";
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { ConsentRepository } from "@/lib/repositories/ConsentRepository";
import { sendConsentRequest } from "@/lib/whatsapp/templates";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { hasRecentInboundFromPhone } from "@/lib/whatsapp/message-log";
import { normalizeIndianPhone } from "@/lib/whatsapp/normalize-phone";
import { SessionRepository } from "@/lib/repositories/SessionRepository";
import { logger } from "@/lib/observability/logger";

const REQUIRED_CONSENT_TYPES = [
  "cv_processing",
  "profile_storage",
  "recruiter_visibility",
  "whatsapp_communication",
] as const;

const CONSENT_TEXT_MAP: Record<string, string> = {
  cv_processing: "I consent to my CV being parsed and stored for job matching purposes.",
  profile_storage: "I consent to my professional profile being stored on TigerHire.",
  recruiter_visibility: "I consent to my masked profile being visible to recruiters.",
  whatsapp_communication: "I consent to receiving WhatsApp messages from TigerHire.",
};

/**
 * Self CV-drop: free-form text first (user just messaged — 24h window open).
 * Referred candidates: approved template first — business-initiated outreach outside 24h.
 */
const CONSENT_PROMPT_SELF =
  "Hi, I'm TigerHire 👋\n\n" +
  "To match you with live roles I need a quick consent. Reply YES to let me process your CV and recommend matches, or NO to opt out.\n\n" +
  "Privacy: https://tigerhire.io/privacy";

const CONSENT_PROMPT_REFERRED =
  "Hi, I'm TigerHire 👋\n\n" +
  "You were referred by someone who trusts your work. To match you with live roles I need a quick consent — reply YES to let me process your CV, or NO to opt out.\n\n" +
  "Privacy: https://tigerhire.io/privacy";

export const ConsentService = {
  async hasRequiredConsent(supabase: SupabaseClient, phone: string): Promise<boolean> {
    return ConsentRepository.hasAllRequiredConsent(supabase, phone);
  },

  async captureConsentViaWhatsApp(
    supabase: SupabaseClient,
    phone: string,
    triggerType: "self_cv_drop" | "referred_candidate",
  ): Promise<{ sent: boolean; via: "text" | "template" | "none"; error?: string }> {
    const normalizedPhone = normalizeIndianPhone(phone);
    const text =
      triggerType === "referred_candidate" ? CONSENT_PROMPT_REFERRED : CONSENT_PROMPT_SELF;

    let sent = false;
    let via: "text" | "template" | "none" = "none";
    let error: string | undefined;

    if (triggerType === "referred_candidate") {
      const tplResult = await sendConsentRequest(normalizedPhone, triggerType);
      if (tplResult.success) {
        sent = true;
        via = "template";
      } else {
        const recentInbound = await hasRecentInboundFromPhone(supabase, normalizedPhone, 24);
        if (recentInbound) {
          const textResult = await sendWhatsAppMessage(normalizedPhone, text);
          if (textResult.success) {
            sent = true;
            via = "text";
          } else {
            error = textResult.error ?? tplResult.error;
          }
        } else {
          error = tplResult.error ?? "consent_delivery_failed";
          logger.warn("Referred consent: template failed and no 24h inbound window", {
            phone: normalizedPhone,
            error,
          });
        }
      }
    } else {
      const textResult = await sendWhatsAppMessage(normalizedPhone, text);
      if (textResult.success) {
        sent = true;
        via = "text";
      } else {
        logger.warn("Consent free-text send failed; falling back to template", {
          phone: normalizedPhone,
          error: textResult.error,
        });
        const tplResult = await sendConsentRequest(normalizedPhone, triggerType);
        if (tplResult.success) {
          sent = true;
          via = "template";
        } else {
          error = tplResult.error ?? textResult.error;
          logger.error("Consent prompt failed via both text and template", {
            phone: normalizedPhone,
            error,
          });
        }
      }
    }

    await SessionRepository.setState(supabase, normalizedPhone, {
      state: "awaiting_consent",
    });

    if (sent) {
      logger.info("Consent request sent via WhatsApp", {
        message: normalizedPhone,
        via,
        triggerType,
      });
    }

    return { sent, via, error };
  },

  /**
   * candidate_id-keyed consent write for non-WhatsApp intake (web apply form, email intake).
   * Unlike {@link recordConsentResponse} (phone-keyed, WhatsApp-only), this records consent
   * against the candidate row so email-only candidates (no phone) are covered.
   *
   * Idempotent per (candidate_id, obtained_via): re-delivery of the same CV does not stack rows.
   * Best-effort callers should still wrap this — it throws only on a DB failure.
   */
  async recordConsentForCandidate(
    supabase: SupabaseClient,
    params: {
      candidateId: string;
      phone?: string | null;
      consentTypes: readonly string[];
      consentGiven: boolean;
      obtainedVia: string;
      /** Overrides the per-type CONSENT_TEXT_MAP wording (used for recruiter-submitted basis). */
      consentText?: string;
      ipAddress?: string | null;
    },
  ): Promise<{ written: number; skipped: boolean }> {
    const already = await ConsentRepository.hasConsentRecordForCandidateVia(
      supabase,
      params.candidateId,
      params.obtainedVia,
    );
    if (already) {
      return { written: 0, skipped: true };
    }

    const records = params.consentTypes.map((type) => ({
      phone: params.phone ?? null,
      candidateId: params.candidateId,
      consentType: type,
      consentGiven: params.consentGiven,
      consentText: params.consentText ?? CONSENT_TEXT_MAP[type] ?? type,
      obtainedVia: params.obtainedVia,
      ipAddress: params.ipAddress ?? null,
    }));

    await ConsentRepository.bulkInsert(supabase, records);
    logger.info("Consent recorded for candidate", {
      candidateId: params.candidateId,
      obtainedVia: params.obtainedVia,
      consentGiven: params.consentGiven,
      types: records.length,
    });
    return { written: records.length, skipped: false };
  },

  async recordConsentResponse(
    supabase: SupabaseClient,
    phone: string,
    response: "yes" | "no",
    messageId?: string,
  ) {
    if (response === "no") {
      await ConsentRepository.recordOptOut(supabase, phone);
      await SessionRepository.setState(supabase, phone, { state: "opted_out" });
      logger.info("Consent opt-out recorded", { message: phone });
      return { consented: false };
    }

    const records = REQUIRED_CONSENT_TYPES.map((type) => ({
      phone,
      consentType: type,
      consentGiven: true,
      consentText: CONSENT_TEXT_MAP[type],
      obtainedVia: "whatsapp_message",
      whatsappMessageId: messageId,
    }));

    await ConsentRepository.bulkInsert(supabase, records);
    await SessionRepository.setState(supabase, phone, {
      state: "consent_given",
    });
    logger.info("Consent granted", { message: phone });
    return { consented: true };
  },

  async requestErasure(
    supabase: SupabaseClient,
    candidateId: string | undefined,
    phone: string | undefined,
    via: "whatsapp" | "email" | "web",
  ) {
    return ConsentRepository.createErasureRequest(supabase, {
      candidateId,
      phone,
      requestedVia: via,
    });
  },
};

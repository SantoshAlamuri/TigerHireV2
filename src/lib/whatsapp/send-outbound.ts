import type { SupabaseClient } from "@supabase/supabase-js";
import { captureConsentViaWhatsApp } from "@/lib/agents/consent";
import { canSendWhatsApp } from "@/lib/whatsapp/outbound-policy";
import {
  referralUtilityTemplateIncludesConsent,
  sendConsentRequest,
  sendReferralUtilityFirstContact,
  type ReferralJobContext,
} from "@/lib/whatsapp/templates";
import type { TemplateSendAttempt } from "@/lib/whatsapp/template-send-fallback";

export type WhatsAppOutboundIntent =
  | "employee_referral_invite"
  | "consent_request_referred"
  | "consent_request_self";

export type SendWhatsAppOutboundInput = {
  intent: WhatsAppOutboundIntent;
  phone: string;
  candidateName?: string;
  referrerName?: string;
  supabase?: SupabaseClient;
  /** Job/company context for referral invites (real company name + apply link). */
  referralJobContext?: ReferralJobContext;
};

/**
 * Intent-based outbound router — callers pass purpose, not raw template names.
 * Policy (UTILITY-first, marketing after consent) is enforced in `canSendWhatsApp`.
 */
export async function sendWhatsAppOutbound(
  input: SendWhatsAppOutboundInput,
): Promise<TemplateSendAttempt & { blocked?: boolean }> {
  const { intent, phone, candidateName, referrerName, supabase, referralJobContext } = input;

  if (intent === "employee_referral_invite") {
    const policy = await canSendWhatsApp({
      phone,
      purpose: "first_contact",
      supabase,
    });
    if (!policy.allowed) {
      return { success: false, error: policy.error, blocked: true };
    }
    const name = candidateName?.trim() || "there";
    const referrer = referrerName?.trim() || "A colleague";
    return sendReferralUtilityFirstContact(phone, name, referrer, referralJobContext);
  }

  if (intent === "consent_request_referred" || intent === "consent_request_self") {
    const policy = await canSendWhatsApp({
      phone,
      purpose: "consent_request",
      supabase,
    });
    if (!policy.allowed) {
      return { success: false, error: policy.error, blocked: true };
    }
    const triggerType =
      intent === "consent_request_referred" ? "referred_candidate" : "self_cv_drop";
    return sendConsentRequest(phone, triggerType);
  }

  return { success: false, error: "unknown_intent" };
}

export { referralUtilityTemplateIncludesConsent };

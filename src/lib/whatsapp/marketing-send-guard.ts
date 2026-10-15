import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { ConsentRepository } from "@/lib/repositories/ConsentRepository";
import { logger } from "@/lib/observability/logger";
import { normalizeIndianPhone } from "@/lib/whatsapp/normalize-phone";
import { canSendWhatsApp, inferPurposeFromTemplate } from "@/lib/whatsapp/outbound-policy";
import { isMarketingWhatsAppTemplate } from "@/lib/whatsapp/template-categories";

export async function hasMarketingConsentForPhone(phone: string): Promise<boolean> {
  const normalized = normalizeIndianPhone(phone);
  if (!/^91[6-9]\d{9}$/.test(normalized)) return false;
  try {
    const admin = createSupabaseAdmin();
    return ConsentRepository.hasAllRequiredConsent(admin, normalized);
  } catch (err) {
    logger.warn("marketing-send-guard: consent lookup failed", { error: String(err) });
    return false;
  }
}

export type MarketingSendGuardResult =
  | { allowed: true }
  | { allowed: false; error: string; reason: "marketing_requires_consent" };

/**
 * Blocks MARKETING templates on cold numbers until required consent is on file.
 * UTILITY and AUTHENTICATION templates are always allowed (first contact / OTP).
 */
export async function guardMarketingWhatsAppTemplate(
  templateName: string,
  phone: string,
): Promise<MarketingSendGuardResult> {
  const purpose = isMarketingWhatsAppTemplate(templateName)
    ? "marketing"
    : inferPurposeFromTemplate(templateName);
  const result = await canSendWhatsApp({ phone, purpose, templateName });
  if (result.allowed) {
    return { allowed: true };
  }
  return {
    allowed: false,
    error: result.error ?? "marketing_requires_consent",
    reason: "marketing_requires_consent",
  };
}

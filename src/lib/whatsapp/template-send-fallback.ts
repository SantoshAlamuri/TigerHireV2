import { logger } from "@/lib/observability/logger";
import { sendTemplateMessage } from "@/lib/services/whatsapp";

const TEMPLATE_LANGUAGE_CODES = ["en", "en_US"] as const;

export type TemplateSendAttempt = {
  success: boolean;
  messageId?: string;
  error?: string;
  templateName?: string;
  languageCode?: string;
};

/**
 * Try approved template names / locales until Meta accepts one.
 * Production WABAs often have v2 approved but not v1, or `en_US` but not `en`.
 */
export async function sendTemplateWithFallback(input: {
  phone: string;
  templateNames: string[];
  bodyParams: string[];
  headerParams?: string[];
}): Promise<TemplateSendAttempt> {
  const { phone, templateNames, bodyParams, headerParams } = input;
  let lastError: string | undefined;

  for (const templateName of templateNames) {
    for (const languageCode of TEMPLATE_LANGUAGE_CODES) {
      const result = await sendTemplateMessage({
        phoneNumber: phone,
        templateName,
        languageCode,
        bodyParams,
        headerParams,
      });
      if (result.success) {
        return { ...result, templateName, languageCode };
      }
      lastError = result.error;
      logger.warn("WhatsApp template send attempt failed", {
        templateName,
        languageCode,
        error: result.error,
        phone_len: phone.replace(/\D/g, "").length,
      });
    }
  }

  return { success: false, error: lastError ?? "all_template_attempts_failed" };
}

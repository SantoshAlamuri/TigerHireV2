import { logger } from "@/lib/observability/logger";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import type { PrescreenChannel } from "@/lib/prescreen/types";

export type DispatchTarget = {
  channel: PrescreenChannel;
  /** WhatsApp / phone-based channels only. */
  phone?: string | null;
};

/**
 * Send a candidate-facing prescreen message on the right channel.
 * - whatsapp / board (with phone): real WhatsApp session text.
 * - form: synchronous (answered in-page); nothing to push -> no-op.
 * - email / board (no phone): not yet wired for outbound; logged so the
 *   lifecycle still advances (timeout will resolve the gate).
 * Returns true when a message was actually sent.
 */
export async function dispatchPrescreenMessage(
  target: DispatchTarget,
  text: string,
): Promise<boolean> {
  if ((target.channel === "whatsapp" || target.channel === "board") && target.phone) {
    // Never fall back to tigerhire_consent_v2 here — that pulls shortlisted
    // candidates into the general consent/CV bot. Callers (reminders) use a
    // UTILITY screening template when session text cannot be delivered.
    const res = await sendWhatsAppMessage(target.phone, text, {
      allowConsentFallback: false,
    });
    if (!res.success) {
      logger.warn("[prescreen] WhatsApp dispatch failed", {
        channel: target.channel,
        error: res.error,
      });
    }
    return res.success;
  }

  if (target.channel === "form") {
    // Form gate is answered in-page; no async push needed.
    return false;
  }

  logger.info("[prescreen] outbound channel not wired; relying on timeout", {
    channel: target.channel,
    hasPhone: Boolean(target.phone),
  });
  return false;
}

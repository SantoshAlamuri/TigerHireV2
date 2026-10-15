import { createHmac } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { pilotBaseUrl } from "./pilot-env";

function signBody(secret: string, raw: string): string {
  return `sha256=${createHmac("sha256", secret).update(raw, "utf8").digest("hex")}`;
}

export function metaWhatsAppSecret(): string | null {
  const s =
    process.env.WHATSAPP_META_APP_SECRET?.trim() ||
    process.env.WHATSAPP_WEBHOOK_SIGNATURE_SECRET?.trim();
  return s || null;
}

/** Normalize to Meta `from` field (digits, no +). */
export function toMetaFromPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function buildMetaTextPayload(opts: { from: string; text: string; messageId?: string }) {
  const from = toMetaFromPhone(opts.from);
  const id = opts.messageId ?? `wamid.pilot-${Date.now()}`;
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from,
                  id,
                  type: "text",
                  text: { body: opts.text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

/**
 * POST inbound WhatsApp webhook to the running app (local or preview).
 * Skips when signature secret is not configured.
 */
export async function postWhatsAppWebhook(
  request: APIRequestContext,
  payload: unknown,
): Promise<{ ok: boolean; status: number; skipped: boolean }> {
  const secret = metaWhatsAppSecret();
  if (!secret) {
    return { ok: false, status: 0, skipped: true };
  }
  const raw = JSON.stringify(payload);
  const base = pilotBaseUrl();
  const res = await request.post(`${base}/api/webhooks/whatsapp`, {
    headers: {
      "Content-Type": "application/json",
      "x-hub-signature-256": signBody(secret, raw),
    },
    data: raw,
  });
  return { ok: res.ok(), status: res.status(), skipped: false };
}

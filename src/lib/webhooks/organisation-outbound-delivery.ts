import { createHmac, randomBytes } from "node:crypto";

import { logger } from "@/lib/observability/logger";

const WEBHOOK_MAX_BODY_BYTES = 256 * 1024;
const WEBHOOK_TIMEOUT_MS = 15_000;

export type OutboundWebhookEnvelope = {
  /** e.g. application.submitted, offer.candidate_responded */
  event: string;
  sent_at: string;
  data: Record<string, unknown>;
};

/**
 * HMAC-SHA256 hex: sign `${timestampSeconds}.${rawBodyString}`.
 */
export function signOutboundWebhookPayload(
  secret: string,
  timestampSec: string,
  body: string,
): string {
  return createHmac("sha256", secret).update(`${timestampSec}.${body}`).digest("hex");
}

export function generateOutboundWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

export function maskSecretTail(secret: string, visible = 4): string {
  if (secret.length <= visible) return "****";
  return `****${secret.slice(-visible)}`;
}

/**
 * POST JSON to customer URL with TigerHire signature headers.
 */
export async function deliverOutboundWebhook(input: {
  targetUrl: string;
  signingSecret: string;
  eventType: string;
  payload: OutboundWebhookEnvelope;
}): Promise<{ ok: true; status: number } | { ok: false; error: string; status?: number }> {
  const body = JSON.stringify(input.payload);
  if (Buffer.byteLength(body, "utf8") > WEBHOOK_MAX_BODY_BYTES) {
    return { ok: false, error: "Payload too large" };
  }
  const ts = String(Math.floor(Date.now() / 1000));
  const v1 = signOutboundWebhookPayload(input.signingSecret, ts, body);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const res = await fetch(input.targetUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-TigerHire-Event": input.eventType,
        "X-TigerHire-Signature": `t=${ts},v1=${v1}`,
        "User-Agent": "TigerHire-Outbound-Webhook/1.0",
      },
      body,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      logger.warn("Outbound webhook non-2xx", {
        status: res.status,
        event: input.eventType,
        preview: errText.slice(0, 200),
      });
      return { ok: false, error: `HTTP ${res.status}`, status: res.status };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    clearTimeout(timeout);
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

import { createHmac, timingSafeEqual } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { sendTypingIndicator } from "@/lib/services/whatsapp";
import { handleInboundMessage } from "@/lib/whatsapp/handler";
import { handleIntakeInboundWebhook, isIntakeWebhookPayload } from "@/lib/whatsapp/intake-inbox";
import {
  extractInboundContextFromWhatsAppMessage,
  normalizeWhatsAppWebhookBody,
} from "@/lib/whatsapp/parse-webhook-payload";
import { extractTemplateStatusUpdates } from "@/lib/whatsapp/parse-template-status-webhook";
import { upsertTemplateStatusFromWebhook } from "@/lib/whatsapp/template-status-store";
import { extractMessageStatusUpdates } from "@/lib/whatsapp/parse-message-status-webhook";
import { handleMessageStatusWebhookUpdates } from "@/lib/whatsapp/handle-message-status-webhook";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { enqueue } from "@/lib/jobs/queue";
import { logger } from "@/lib/observability/logger";

function tokensMatch(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Burn the same cycles as a same-length compare so attacker timing
    // can't distinguish length mismatch from value mismatch.
    timingSafeEqual(a, Buffer.alloc(a.length));
    return false;
  }
  return timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token")?.trim() ?? "";
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && tokensMatch(token, env.whatsappWebhookSecret)) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function verifyWhatsAppSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!secret || !signatureHeader?.startsWith("sha256=")) return false;
  const expectedHex = signatureHeader.slice(7).trim();
  if (expectedHex.length !== 64 || !/^[a-f0-9]+$/i.test(expectedHex)) return false;
  const computed = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  try {
    const a = Buffer.from(expectedHex, "hex");
    const b = Buffer.from(computed, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  const secret = env.whatsappWebhookSignatureSecret;
  if (!verifyWhatsAppSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const templateUpdates = extractTemplateStatusUpdates(body);
  if (templateUpdates.length > 0) {
    const admin = createSupabaseAdmin();
    const wabaId = env.metaWabaId?.trim() || null;
    for (const u of templateUpdates) {
      logger.info("whatsapp_template_status_update", {
        event_name: "whatsapp_template_status_update",
        template_event: u.event,
        template_name: u.message_template_name,
        template_language: u.message_template_language,
        template_id: u.message_template_id,
        rejection_reason: u.rejection_reason ?? u.reason,
      });
      await upsertTemplateStatusFromWebhook(admin, u, wabaId);
    }
    return NextResponse.json({ status: "received" }, { status: 200 });
  }

  const messageStatusUpdates = extractMessageStatusUpdates(body);
  if (messageStatusUpdates.length > 0) {
    after(async () => {
      try {
        const admin = createSupabaseAdmin();
        await handleMessageStatusWebhookUpdates(admin, messageStatusUpdates);
      } catch (err) {
        logger.error("WhatsApp message status webhook handler error", { error: String(err) });
      }
    });
    return NextResponse.json({ status: "received" }, { status: 200 });
  }

  // Partner-intake number (Apna resume forwarding): a pure pipe, not a conversation.
  // Branch BEFORE the per-phone rate limit (partners burst-forward) and before the
  // candidate machine — intake senders must never get sessions, consent prompts, or
  // typing indicators. Idempotency: whatsapp_intake_items dedupes on wa_message_id.
  if (isIntakeWebhookPayload(body)) {
    after(async () => {
      try {
        await handleIntakeInboundWebhook(body);
      } catch (err) {
        logger.error("WhatsApp intake webhook handler error", { error: String(err) });
      }
    });
    return NextResponse.json({ status: "received" }, { status: 200 });
  }

  const normalizedForRl = normalizeWhatsAppWebhookBody(body);
  const messages = normalizedForRl?.messages ?? [];
  if (messages.length === 0) {
    return NextResponse.json({ status: "received" }, { status: 200 });
  }

  // Process EVERY message in the payload, not just messages[0]. Meta coalesces
  // multiple messages into one webhook when a user fires several bubbles in quick
  // succession (e.g. a CV document immediately followed by a text). The previous
  // messages[0]-only handling silently dropped the rest.
  const admin = createSupabaseAdmin();
  const durableInbound = process.env.WHATSAPP_DURABLE_INBOUND === "true";
  let claimErrorOccurred = false;

  for (const message of messages) {
    const from = typeof message?.from === "string" ? message.from.trim() : "";
    const messageId = message?.id?.trim() || null;

    // Rate limit: 10 messages per phone per 60 seconds.
    const phone = from || "unknown";
    const rl = await checkRateLimit({
      key: `wa:${phone}`,
      limit: 10,
      windowSecs: 60,
    });
    if (!rl.allowed) {
      logger.warn("whatsapp_webhook_rate_limited", {
        event_name: "whatsapp_webhook_rate_limited",
        phone_digits_len: phone === "unknown" ? 0 : phone.replace(/\D/g, "").length,
      });
      continue;
    }

    const singlePayload = {
      ...normalizedForRl,
      messages: [message],
      extracted: extractInboundContextFromWhatsAppMessage(message),
    } as Parameters<typeof handleInboundMessage>[0];

    // Durable, per-phone-serialized path (opt-in via WHATSAPP_DURABLE_INBOUND).
    // The Inngest worker claims idempotency and runs the handler with
    // concurrency:{key:phone,limit:1}, so same-phone messages cannot interleave
    // and corrupt session state. Falls through to the inline path when enqueue is
    // a no-op (INNGEST_EVENT_KEY unset) so a message is never silently dropped.
    if (durableInbound) {
      const enq = await enqueue(
        "whatsapp-inbound",
        { phone: from, messageId, payload: singlePayload },
        messageId ? { id: `wa-inbound:${messageId}` } : undefined,
      );
      if (enq.id) {
        continue;
      }
      logger.warn("whatsapp_durable_inbound_enqueue_noop_inline_fallback", {});
    }

    // Inline path (default, and fallback when the durable enqueue is unavailable).
    // Atomic idempotency claim BEFORE scheduling work, per message — dedupes Meta's
    // retries so we don't double-run consent writes, prescreen answers, or
    // FitScore (Claude $$).
    if (messageId) {
      const { data: claimed, error: claimErr } = await admin.rpc("webhook_event_try_acquire", {
        p_provider: "whatsapp",
        p_event_id: messageId,
      });
      if (claimErr) {
        // Fail CLOSED: do not process on an unverified claim — a duplicate could
        // burn Claude/FitScore spend. Return a non-200 below so Meta redelivers the
        // batch; any sibling messages we already claimed dedup on that redelivery.
        logger.warn("whatsapp_webhook_idempotency_acquire_failed", {
          error: claimErr.message,
        });
        claimErrorOccurred = true;
        continue;
      }
      if (claimed === false) {
        // Already processed — Meta retry or duplicate fan-out.
        continue;
      }
    }

    const typingMessageId = messageId;
    const shouldSendTyping = Boolean(typingMessageId && from);
    // Next.js `after()` schedules work to run after the response has finished; it must
    // not be awaited here. Deferred: read receipt + typing, then full inbound handling.
    after(async () => {
      try {
        if (shouldSendTyping && typingMessageId) {
          await sendTypingIndicator(typingMessageId);
        }
        await handleInboundMessage(singlePayload);
      } catch (err) {
        logger.error("WhatsApp webhook handler error", { error: String(err) });
      }
    });
  }

  if (claimErrorOccurred) {
    // Non-200 → Meta redelivers the batch. Messages we already claimed dedup on
    // redelivery; the unclaimed one(s) get a fresh, safe attempt.
    return NextResponse.json({ status: "retry" }, { status: 503 });
  }

  return NextResponse.json({ status: "received" }, { status: 200 });
}

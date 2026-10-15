import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { resolveApplicationIdForInboundPhone } from "@/lib/whatsapp/inbound-application-resolution";
import { insertApplicationWaMessage } from "@/lib/whatsapp/wa-messages-db";

const PREVIEW_MAX = 1024;

/**
 * Throttle the "no application to attach" warning: same digit-normalized number only logs once
 * per hour per process. In-memory only; with multiple app instances each can emit one warning per
 * window for the same phone (acceptable for launch).
 */
const NULL_APP_WARN_THROTTLE_MS = 3_600_000;
const nullAppAttachWarningLastLogAt = new Map<string, number>();

function shouldLogNullApplicationAttach(phoneDigits: string): boolean {
  const now = Date.now();
  const last = nullAppAttachWarningLastLogAt.get(phoneDigits);
  if (last !== undefined && now - last < NULL_APP_WARN_THROTTLE_MS) {
    return false;
  }
  nullAppAttachWarningLastLogAt.set(phoneDigits, now);
  return true;
}

/** Subset of inbound message fields used for preview + logging. */
export type InboundMessageForPreview = {
  id?: string;
  type: string;
  text?: { body?: string };
  document?: { filename?: string; mime_type?: string };
  image?: { id: string };
  button?: { text?: string; payload?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
};

export function previewFromInboundMessage(msg: InboundMessageForPreview): string | null {
  const t = msg.type;
  if (t === "text") {
    const b = msg.text?.body?.trim();
    return b ? b.slice(0, PREVIEW_MAX) : null;
  }
  if (t === "document") {
    const name = msg.document?.filename?.trim() || "file";
    const mime = msg.document?.mime_type ? ` (${msg.document.mime_type})` : "";
    return `Document: ${name}${mime}`.slice(0, PREVIEW_MAX);
  }
  if (t === "image") return "Image";
  if (t === "button") {
    const parts = [msg.button?.text, msg.button?.payload].filter(Boolean);
    return parts.length ? `Button: ${parts.join(" — ")}`.slice(0, PREVIEW_MAX) : "Button";
  }
  if (t === "interactive") {
    const br = msg.interactive?.button_reply;
    const lr = msg.interactive?.list_reply;
    if (br?.title || br?.id) return `Reply: ${br.title ?? br.id}`.slice(0, PREVIEW_MAX);
    if (lr?.title || lr?.id) return `List: ${lr.title ?? lr.id}`.slice(0, PREVIEW_MAX);
    return "Interactive";
  }
  return `[${t}]`.slice(0, PREVIEW_MAX);
}

/** True if this number sent an inbound message within the last `withinHours` (default 24). */
export async function hasRecentInboundFromPhone(
  supabase: SupabaseClient,
  phone: string,
  withinHours = 24,
): Promise<boolean> {
  const phoneDigits = phone.replace(/\D/g, "");
  if (phoneDigits.length < 8) return false;
  const since = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("whatsapp_message_log")
    .select("id")
    .eq("phone", phoneDigits)
    .eq("direction", "inbound")
    .gte("created_at", since)
    .limit(1);
  if (error) {
    logger.warn("hasRecentInboundFromPhone query failed", { message: error.message });
    return false;
  }
  return (data?.length ?? 0) > 0;
}

export async function logWhatsAppInbound(input: {
  phone: string;
  waMessageId?: string;
  messageType: string;
  bodyPreview: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const phone = input.phone.replace(/\D/g, "");
  if (phone.length < 8) return;
  try {
    const admin = createSupabaseAdmin();
    const { error } = await admin.from("whatsapp_message_log").insert({
      phone,
      direction: "inbound",
      wa_message_id: input.waMessageId ?? null,
      message_type: input.messageType,
      body_preview: input.bodyPreview ? input.bodyPreview.slice(0, PREVIEW_MAX) : null,
      metadata: input.metadata ?? {},
    });
    if (error) {
      logger.warn("whatsapp_message_log inbound insert failed", { message: error.message });
    }
  } catch (e) {
    logger.warn("whatsapp_message_log inbound exception", { error: String(e) });
  }
}

/**
 * Resolves a best-effort `application_id` and writes a row to `wa_messages` for the app thread
 * (inbound). Safe to call after `logWhatsAppInbound`; idempotent on `wa_message_id` when set.
 */
export async function recordInboundToApplicationThread(input: {
  phone: string;
  waMessageId?: string;
  bodyPreview: string | null;
}): Promise<void> {
  const { applicationId, ambiguous, allActiveApplicationIds } =
    await resolveApplicationIdForInboundPhone(input.phone);
  if (!applicationId) {
    const phoneDigits = input.phone.replace(/\D/g, "");
    if (shouldLogNullApplicationAttach(phoneDigits)) {
      logger.warn(
        "inbound: no active application to attach; wa_messages row will use null application_id",
        {
          phone: input.phone,
        },
      );
    }
  }
  await insertApplicationWaMessage({
    applicationId,
    direction: "in",
    waMessageId: input.waMessageId ?? null,
    templateName: null,
    body: input.bodyPreview,
    status: "received",
    rawPayload: {
      phone: input.phone,
      ambiguous: ambiguous && allActiveApplicationIds.length > 1,
      allActiveApplicationIds,
    },
  });
}

export async function logWhatsAppOutbound(input: {
  phoneDigits: string;
  waMessageId?: string;
  messageType: string;
  bodyPreview: string | null;
  metadata?: Record<string, unknown>;
  /** When set, also write a row to `wa_messages` for the application thread. */
  applicationId?: string;
  templateName?: string | null;
}): Promise<void> {
  const phone = input.phoneDigits.replace(/\D/g, "");
  if (phone.length < 8) return;
  try {
    const admin = createSupabaseAdmin();
    const { error } = await admin.from("whatsapp_message_log").insert({
      phone,
      direction: "outbound",
      wa_message_id: input.waMessageId ?? null,
      message_type: input.messageType,
      body_preview: input.bodyPreview ? input.bodyPreview.slice(0, PREVIEW_MAX) : null,
      metadata: input.metadata ?? {},
    });
    if (error) {
      logger.warn("whatsapp_message_log outbound insert failed", { message: error.message });
    }
  } catch (e) {
    logger.warn("whatsapp_message_log outbound exception", { error: String(e) });
  }

  if (input.applicationId) {
    await insertApplicationWaMessage({
      applicationId: input.applicationId,
      direction: "out",
      waMessageId: input.waMessageId ?? null,
      templateName: input.templateName ?? null,
      body: input.bodyPreview,
      status: "sent",
      rawPayload: { ...input.metadata, phone: input.phoneDigits },
    });
  }
}

/** Build outbound preview from Meta Cloud API message payload (postMetaMessage body). */
export function previewFromOutboundPayload(payload: Record<string, unknown>): {
  messageType: string;
  bodyPreview: string | null;
} {
  const type = typeof payload.type === "string" ? payload.type : "unknown";
  if (type === "text") {
    const text = payload.text as { body?: string } | undefined;
    const b = text?.body?.trim();
    return { messageType: type, bodyPreview: b ? b.slice(0, PREVIEW_MAX) : null };
  }
  if (type === "template") {
    const tpl = payload.template as { name?: string } | undefined;
    const name = tpl?.name?.trim();
    return {
      messageType: type,
      bodyPreview: name ? `Template: ${name}` : "Template",
    };
  }
  return { messageType: type, bodyPreview: `[${type}]` };
}

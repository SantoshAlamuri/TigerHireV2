import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import { getPublicWhatsAppChatUrl } from "@/lib/marketing/public-whatsapp";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { normalizeReferrerWhatsapp } from "@/lib/referrers/normalize-whatsapp";
import type { WhatsAppMessageStatusUpdate } from "@/lib/whatsapp/parse-message-status-webhook";

const REFERRAL_OUTREACH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Status ranking — only move forward (sent → delivered → read), and treat `failed` as terminal.
 * Stops a late `sent` overwriting an earlier `delivered`.
 */
const STATUS_RANK: Record<string, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

function shouldOverwrite(prev: string | null | undefined, next: string): boolean {
  if (!prev) return true;
  if (prev === "failed") return false;
  const prevRank = STATUS_RANK[prev] ?? 0;
  const nextRank = STATUS_RANK[next] ?? 0;
  return nextRank >= prevRank;
}

function formatError(u: WhatsAppMessageStatusUpdate): string | null {
  if (u.status !== "failed") return null;
  const parts: string[] = [];
  if (u.errorCode != null) parts.push(String(u.errorCode));
  if (u.errorTitle) parts.push(u.errorTitle);
  if (u.errorMessage && u.errorMessage !== u.errorTitle) parts.push(u.errorMessage);
  return parts.length > 0 ? parts.join(" — ") : "failed";
}

async function updateMessageLogDelivery(
  supabase: SupabaseClient,
  u: WhatsAppMessageStatusUpdate,
): Promise<void> {
  const { data: existing, error: selErr } = await supabase
    .from("whatsapp_message_log")
    .select("id, delivery_status")
    .eq("wa_message_id", u.waMessageId)
    .maybeSingle();

  if (selErr) {
    logger.warn("whatsapp_message_log status select failed", {
      wa_message_id: u.waMessageId,
      message: selErr.message,
    });
    return;
  }
  if (!existing) {
    logger.info("whatsapp_message_log status: no row matched wa_message_id", {
      wa_message_id: u.waMessageId,
      status: u.status,
    });
    return;
  }
  if (!shouldOverwrite(existing.delivery_status as string | null, u.status)) {
    return;
  }

  const error = formatError(u);
  const { error: updErr } = await supabase
    .from("whatsapp_message_log")
    .update({
      delivery_status: u.status,
      delivery_error: error,
      delivery_updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);

  if (updErr) {
    logger.warn("whatsapp_message_log status update failed", {
      wa_message_id: u.waMessageId,
      message: updErr.message,
    });
    return;
  }

  logger.info("whatsapp_message_log status updated", {
    event_name: "whatsapp_message_status_update",
    wa_message_id: u.waMessageId,
    status: u.status,
    error_code: u.errorCode,
  });
}

async function notifyReferrerOnFailedDelivery(
  supabase: SupabaseClient,
  u: WhatsAppMessageStatusUpdate,
  referrerId: string,
): Promise<void> {
  const { data: referrer } = await supabase
    .from("referrers")
    .select("whatsapp_number")
    .eq("user_id", referrerId)
    .maybeSingle();

  const referrerPhone = normalizeReferrerWhatsapp(
    (referrer?.whatsapp_number as string | null) ?? "",
  );
  if (!referrerPhone) return;

  const displayPhone = u.recipientPhone.replace(/^91/, "");
  const warmLink = getPublicWhatsAppChatUrl("Hi");
  const errHint = formatError(u) ?? "WhatsApp could not deliver";

  await sendWhatsAppMessage(
    referrerPhone,
    `We could not deliver the referral invite to your friend (${displayPhone}). ${errHint}. Ask them to open this link and send Hi, then reply RESEND ${displayPhone}: ${warmLink}`,
  );
}

/**
 * Denormalize the latest delivery status onto the most recent referral for this recipient
 * (consumer referral flow). Monotonic — won't downgrade, and the guard also dedupes the
 * referrer "failed" notification since a prior `failed` blocks re-entry.
 */
async function syncReferralOutreachDelivery(
  supabase: SupabaseClient,
  u: WhatsAppMessageStatusUpdate,
): Promise<void> {
  const windowStart = new Date(Date.now() - REFERRAL_OUTREACH_WINDOW_MS).toISOString();
  const { data: referral, error: selErr } = await supabase
    .from("referrals")
    .select("id, referrer_id, last_outreach_delivery_status")
    .eq("target_phone", u.recipientPhone)
    .gte("created_at", windowStart)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selErr) {
    logger.warn("referrals outreach status select failed", {
      recipient_phone_len: u.recipientPhone.length,
      message: selErr.message,
    });
    return;
  }
  if (!referral) return;
  if (!shouldOverwrite(referral.last_outreach_delivery_status as string | null, u.status)) {
    return;
  }

  const { error: updErr } = await supabase
    .from("referrals")
    .update({
      last_outreach_delivery_status: u.status,
      last_outreach_delivery_error: formatError(u),
      last_outreach_delivery_at: new Date().toISOString(),
    })
    .eq("id", referral.id);

  if (updErr) {
    logger.warn("referrals outreach status update failed", {
      recipient_phone_len: u.recipientPhone.length,
      message: updErr.message,
    });
    return;
  }

  if (u.status === "failed" && referral.referrer_id) {
    await notifyReferrerOnFailedDelivery(supabase, u, referral.referrer_id as string);
  }
}

export async function handleMessageStatusWebhookUpdates(
  supabase: SupabaseClient,
  updates: WhatsAppMessageStatusUpdate[],
): Promise<void> {
  for (const u of updates) {
    try {
      await updateMessageLogDelivery(supabase, u);
      await syncReferralOutreachDelivery(supabase, u);
    } catch (err) {
      logger.error("handleMessageStatusWebhookUpdates failed for one update", {
        wa_message_id: u.waMessageId,
        error: String(err),
      });
    }
  }
}

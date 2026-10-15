import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import {
  deliverOutboundWebhook,
  type OutboundWebhookEnvelope,
} from "@/lib/webhooks/organisation-outbound-delivery";

const MAX_STORED_PAYLOAD_BYTES = 200 * 1024;

function storagePayloadData(data: Record<string, unknown>): Record<string, unknown> {
  const s = JSON.stringify(data);
  const bytes = Buffer.byteLength(s, "utf8");
  if (bytes > MAX_STORED_PAYLOAD_BYTES) {
    return {
      _tigerhire_payload_truncated: true,
      _original_size_bytes: bytes,
    };
  }
  return data;
}

/**
 * Appends a delivery row. Failures are logged; callers should not throw.
 */
export async function insertOutboundWebhookDelivery(
  admin: SupabaseClient,
  row: {
    organisationId: string;
    outboundWebhookId: string;
    eventType: string;
    /** Persisted (possibly truncated) inner `data` of the envelope */
    payloadData: Record<string, unknown>;
    deliveryStatus: "success" | "failed";
    httpStatus: number | null;
    errorMessage: string | null;
    attemptNumber: number;
    replayOf: string | null;
  },
): Promise<void> {
  const { error } = await admin.from("outbound_webhook_deliveries").insert({
    organisation_id: row.organisationId,
    outbound_webhook_id: row.outboundWebhookId,
    event_type: row.eventType,
    payload_data: row.payloadData,
    delivery_status: row.deliveryStatus,
    http_status: row.httpStatus,
    error_message: row.errorMessage,
    attempt_number: row.attemptNumber,
    replay_of: row.replayOf,
  });
  if (error) {
    logger.warn("outbound_webhook_deliveries insert failed", { message: error.message });
  }
}

/**
 * HMAC fan-out: deliver to all matching enabled hooks and record one row per HTTP attempt.
 * Used from Inngest; must not throw for partial failures.
 */
export async function runOrganisationOutboundWebhookFanout(input: {
  organisationId: string;
  eventType: string;
  data: Record<string, unknown>;
}): Promise<{ hooks: number; sent: number; failed: number }> {
  const admin = createSupabaseAdmin();
  const { data: hooks, error } = await admin
    .from("organisation_outbound_webhooks")
    .select("id, target_url, signing_secret, event_types")
    .eq("organisation_id", input.organisationId)
    .eq("is_enabled", true);
  if (error) {
    logger.error("outbound webhooks list failed", { error: String(error) });
    return { hooks: 0, sent: 0, failed: 0 };
  }
  const list = hooks ?? [];
  const wantsEvent = (types: string[] | null) => {
    if (!types || types.length === 0) return false;
    if (types.includes("*")) return true;
    return types.includes(input.eventType);
  };
  const payloadForLog = storagePayloadData(input.data);
  let sent = 0;
  let failed = 0;

  for (const h of list) {
    const types = h.event_types as string[] | null;
    if (!wantsEvent(types)) continue;
    const targetUrl = String(h.target_url ?? "");
    const signingSecret = String(h.signing_secret ?? "");
    if (!targetUrl || !signingSecret) continue;

    const envelope: OutboundWebhookEnvelope = {
      event: input.eventType,
      sent_at: new Date().toISOString(),
      data: input.data,
    };
    const result = await deliverOutboundWebhook({
      targetUrl,
      signingSecret,
      eventType: input.eventType,
      payload: envelope,
    });
    if (result.ok) {
      sent += 1;
    } else {
      failed += 1;
    }
    const http: number | null = result.ok
      ? result.status
      : "status" in result && result.status != null
        ? result.status
        : null;
    await insertOutboundWebhookDelivery(admin, {
      organisationId: input.organisationId,
      outboundWebhookId: String(h.id),
      eventType: input.eventType,
      payloadData: payloadForLog,
      deliveryStatus: result.ok ? "success" : "failed",
      httpStatus: http,
      errorMessage: result.ok ? null : "error" in result ? result.error : "Unknown error",
      attemptNumber: 1,
      replayOf: null,
    });
  }

  return { hooks: list.length, sent, failed };
}

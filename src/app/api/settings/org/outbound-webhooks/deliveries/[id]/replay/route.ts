import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { handleApiError, jsonError, jsonSuccess } from "@/lib/api-helpers";
import { requireSettingsAdmin } from "@/lib/settings/server";
import { validateOrigin } from "@/lib/security/csrf";
import { deliverOutboundWebhook } from "@/lib/webhooks/organisation-outbound-delivery";
import { insertOutboundWebhookDelivery } from "@/lib/webhooks/fanout-organisation-outbound";

type RouteContext = { params: Promise<{ id: string }> };

function isTruncatedPayload(data: unknown): boolean {
  if (data == null || typeof data !== "object" || Array.isArray(data)) return false;
  const o = data as Record<string, unknown>;
  return o._tigerhire_payload_truncated === true;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const auth = await requireSettingsAdmin(request, {
      validateCsrf: true,
      capability: "manage_integrations",
    });
    if (auth.error) return auth.error;
    const { id } = await context.params;
    const orgId = auth.context.organisationId;
    if (!id) return jsonError("Invalid delivery id", 400);

    const admin = createSupabaseAdmin();
    const { data: delivery, error: dErr } = await admin
      .from("outbound_webhook_deliveries")
      .select("id, organisation_id, outbound_webhook_id, event_type, payload_data, attempt_number")
      .eq("id", id)
      .maybeSingle();
    if (dErr || !delivery) return jsonError("Delivery not found", 404);
    if ((delivery.organisation_id as string) !== orgId) {
      return jsonError("Forbidden", 403);
    }
    if (isTruncatedPayload(delivery.payload_data)) {
      return jsonError(
        "Cannot replay: original payload was too large to store. Re-send a new system event instead.",
        422,
      );
    }
    const payloadData = (delivery.payload_data as Record<string, unknown>) ?? {};

    const { data: hook, error: hErr } = await admin
      .from("organisation_outbound_webhooks")
      .select("id, target_url, signing_secret, is_enabled, organisation_id")
      .eq("id", delivery.outbound_webhook_id as string)
      .eq("organisation_id", orgId)
      .maybeSingle();
    if (hErr || !hook) {
      return jsonError("Endpoint no longer exists for this org. The webhook was removed.", 409);
    }
    if (!hook.is_enabled) {
      return jsonError("Webhook is disabled. Enable it and try again.", 409);
    }

    const eventType = String(delivery.event_type);
    const attempt = Number(delivery.attempt_number ?? 1) + 1;
    const envelope = {
      event: eventType,
      sent_at: new Date().toISOString(),
      data: payloadData,
    };
    const result = await deliverOutboundWebhook({
      targetUrl: String(hook.target_url ?? ""),
      signingSecret: String(hook.signing_secret ?? ""),
      eventType,
      payload: envelope,
    });
    const http: number | null = result.ok
      ? result.status
      : "status" in result && result.status != null
        ? result.status
        : null;
    await insertOutboundWebhookDelivery(admin, {
      organisationId: orgId,
      outboundWebhookId: String(hook.id),
      eventType,
      payloadData,
      deliveryStatus: result.ok ? "success" : "failed",
      httpStatus: http,
      errorMessage: result.ok ? null : "error" in result ? result.error : "Unknown error",
      attemptNumber: attempt,
      replayOf: id,
    });
    if (!result.ok) {
      return jsonError("Replay delivery failed. A new row was logged.", 502);
    }
    return jsonSuccess({ ok: true, deliveryStatus: "success" as const, attempt });
  } catch (err) {
    return handleApiError(err, "Failed to replay webhook delivery", {
      route: "POST /api/settings/org/outbound-webhooks/deliveries/[id]/replay",
    });
  }
}

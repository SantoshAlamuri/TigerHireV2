import { NextRequest } from "next/server";
import {
  handleApiError,
  handleZodError,
  jsonError,
  jsonSuccess,
  parseJsonBody,
} from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSettingsAdmin } from "@/lib/settings/server";
import { validateOrigin } from "@/lib/security/csrf";
import { createOutboundWebhookSchema } from "@/lib/validations/outbound-webhooks";
import {
  generateOutboundWebhookSecret,
  maskSecretTail,
} from "@/lib/webhooks/organisation-outbound-delivery";
import { writeAuditLog } from "@/lib/repositories/integrations.repository";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSettingsAdmin(request, { capability: "manage_integrations" });
    if (auth.error) return auth.error;

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("organisation_outbound_webhooks")
      .select("id, name, target_url, event_types, is_enabled, created_at, updated_at")
      .eq("organisation_id", auth.context.organisationId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    return jsonSuccess({
      webhooks: (data ?? []).map((w) => ({
        id: w.id,
        name: w.name,
        targetUrl: w.target_url,
        eventTypes: w.event_types,
        isEnabled: w.is_enabled,
        createdAt: w.created_at,
        updatedAt: w.updated_at,
        /* Never expose signing secrets after create */
        hasSecret: true,
        signingSecretPreview: "****",
      })),
    });
  } catch (err) {
    return handleApiError(err, "Failed to list outbound webhooks", {
      route: "GET /api/settings/org/outbound-webhooks",
    });
  }
}

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const auth = await requireSettingsAdmin(request, {
      validateCsrf: true,
      capability: "manage_integrations",
    });
    if (auth.error) return auth.error;

    const { body, errorResponse } = await parseJsonBody(
      request,
      "POST /api/settings/org/outbound-webhooks",
    );
    if (errorResponse) return errorResponse;
    const parsed = createOutboundWebhookSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const secret = generateOutboundWebhookSecret();
    const supabase = await createSupabaseServerClient();
    const { data: row, error } = await supabase
      .from("organisation_outbound_webhooks")
      .insert({
        organisation_id: auth.context.organisationId,
        name: parsed.data.name ?? null,
        target_url: parsed.data.targetUrl,
        signing_secret: secret,
        event_types: parsed.data.eventTypes,
        is_enabled: parsed.data.isEnabled,
        created_by: auth.context.userId,
        updated_at: new Date().toISOString(),
      })
      .select("id, name, target_url, event_types, is_enabled, created_at")
      .single();
    if (error) throw error;

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    await writeAuditLog(supabase, {
      organisation_id: auth.context.organisationId,
      actor_user_id: auth.context.userId,
      actor_email: auth.context.actorEmail,
      event_type: "outbound_webhook.created",
      resource_type: "organisation_outbound_webhook",
      resource_id: String(row.id),
      metadata: { name: row.name, targetUrl: row.target_url },
      ip_address: ip,
    });

    return jsonSuccess(
      {
        webhook: {
          id: row.id,
          name: row.name,
          targetUrl: row.target_url,
          eventTypes: row.event_types,
          isEnabled: row.is_enabled,
          createdAt: row.created_at,
          /**
           * Returned **once**; store for your receiver (HMAC verification). Not shown on GET.
           */
          signingSecret: secret,
          signingSecretPreview: maskSecretTail(secret),
        },
      },
      201,
    );
  } catch (err) {
    return handleApiError(err, "Failed to create outbound webhook", {
      route: "POST /api/settings/org/outbound-webhooks",
    });
  }
}

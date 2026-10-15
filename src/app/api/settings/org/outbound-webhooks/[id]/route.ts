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
import { patchOutboundWebhookSchema } from "@/lib/validations/outbound-webhooks";
import { writeAuditLog } from "@/lib/repositories/integrations.repository";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const auth = await requireSettingsAdmin(request, {
      validateCsrf: true,
      capability: "manage_integrations",
    });
    if (auth.error) return auth.error;
    const { id } = await context.params;
    if (!id) return jsonError("Invalid id", 400);

    const { body, errorResponse } = await parseJsonBody(
      request,
      "PATCH /api/settings/org/outbound-webhooks/[id]",
    );
    if (errorResponse) return errorResponse;
    const parsed = patchOutboundWebhookSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);
    if (Object.keys(parsed.data).length === 0) return jsonError("No changes", 400);

    const supabase = await createSupabaseServerClient();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.targetUrl !== undefined) updates.target_url = parsed.data.targetUrl;
    if (parsed.data.eventTypes !== undefined) updates.event_types = parsed.data.eventTypes;
    if (parsed.data.isEnabled !== undefined) updates.is_enabled = parsed.data.isEnabled;

    const { data, error } = await supabase
      .from("organisation_outbound_webhooks")
      .update(updates)
      .eq("id", id)
      .eq("organisation_id", auth.context.organisationId)
      .select("id, name, target_url, event_types, is_enabled, created_at, updated_at")
      .maybeSingle();
    if (error) throw error;
    if (!data) return jsonError("Not found", 404);

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    await writeAuditLog(supabase, {
      organisation_id: auth.context.organisationId,
      actor_user_id: auth.context.userId,
      actor_email: auth.context.actorEmail,
      event_type: "outbound_webhook.updated",
      resource_type: "organisation_outbound_webhook",
      resource_id: id,
      metadata: parsed.data,
      ip_address: ip,
    });

    return jsonSuccess({
      webhook: {
        id: data.id,
        name: data.name,
        targetUrl: data.target_url,
        eventTypes: data.event_types,
        isEnabled: data.is_enabled,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to update outbound webhook", {
      route: "PATCH /api/settings/org/outbound-webhooks/[id]",
    });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const auth = await requireSettingsAdmin(request, {
      validateCsrf: true,
      capability: "manage_integrations",
    });
    if (auth.error) return auth.error;
    const { id } = await context.params;
    if (!id) return jsonError("Invalid id", 400);

    const supabase = await createSupabaseServerClient();
    const { data: deleted, error } = await supabase
      .from("organisation_outbound_webhooks")
      .delete()
      .eq("id", id)
      .eq("organisation_id", auth.context.organisationId)
      .select("id");
    if (error) throw error;
    if (!deleted?.length) return jsonError("Not found", 404);

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    await writeAuditLog(supabase, {
      organisation_id: auth.context.organisationId,
      actor_user_id: auth.context.userId,
      actor_email: auth.context.actorEmail,
      event_type: "outbound_webhook.deleted",
      resource_type: "organisation_outbound_webhook",
      resource_id: id,
      metadata: {},
      ip_address: ip,
    });

    return jsonSuccess({ ok: true });
  } catch (err) {
    return handleApiError(err, "Failed to delete outbound webhook", {
      route: "DELETE /api/settings/org/outbound-webhooks/[id]",
    });
  }
}

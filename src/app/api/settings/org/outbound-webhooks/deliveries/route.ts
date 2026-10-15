import { NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError, handleZodError, jsonSuccess } from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSettingsAdmin } from "@/lib/settings/server";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(40),
  status: z.enum(["all", "success", "failed"]).optional().default("all"),
  webhookId: z.string().uuid().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSettingsAdmin(request, { capability: "manage_integrations" });
    if (auth.error) return auth.error;
    const orgId = auth.context.organisationId;

    const { searchParams } = new URL(request.url);
    const raw = {
      limit: searchParams.get("limit") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      webhookId: searchParams.get("webhookId") ?? undefined,
    };
    const parsed = querySchema.safeParse(raw);
    if (!parsed.success) return handleZodError(parsed.error);
    const { limit, status, webhookId } = parsed.data;

    const supabase = await createSupabaseServerClient();
    let q = supabase
      .from("outbound_webhook_deliveries")
      .select(
        "id, outbound_webhook_id, event_type, delivery_status, http_status, error_message, attempt_number, replay_of, created_at",
      )
      .eq("organisation_id", orgId);
    if (status !== "all") {
      q = q.eq("delivery_status", status);
    }
    if (webhookId) {
      q = q.eq("outbound_webhook_id", webhookId);
    }
    const { data: rows, error } = await q.order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;

    const whIds = [...new Set((rows ?? []).map((r) => r.outbound_webhook_id as string))];
    const hookMeta: Record<string, { name: string | null; targetUrl: string }> = {};
    if (whIds.length > 0) {
      const { data: hooks } = await supabase
        .from("organisation_outbound_webhooks")
        .select("id, name, target_url")
        .eq("organisation_id", orgId)
        .in("id", whIds);
      for (const h of hooks ?? []) {
        hookMeta[(h as { id: string }).id] = {
          name: (h as { name: string | null }).name,
          targetUrl: String((h as { target_url: string }).target_url ?? ""),
        };
      }
    }

    return jsonSuccess({
      deliveries: (rows ?? []).map((r) => {
        const id = r.outbound_webhook_id as string;
        const meta = hookMeta[id];
        return {
          id: r.id,
          outboundWebhookId: id,
          hookName: meta?.name ?? null,
          targetUrl: meta?.targetUrl ? maskUrl(meta.targetUrl) : null,
          eventType: r.event_type,
          deliveryStatus: r.delivery_status,
          httpStatus: r.http_status,
          errorMessage: r.error_message,
          attemptNumber: r.attempt_number,
          replayOf: r.replay_of,
          createdAt: r.created_at,
        };
      }),
    });
  } catch (err) {
    return handleApiError(err, "Failed to list webhook deliveries", {
      route: "GET /api/settings/org/outbound-webhooks/deliveries",
    });
  }
}

function maskUrl(u: string): string {
  try {
    const url = new URL(u);
    return `${url.protocol}//${url.host}${url.pathname.length > 32 ? url.pathname.slice(0, 28) + "…" : url.pathname}`;
  } catch {
    return u.length > 48 ? `${u.slice(0, 40)}…` : u;
  }
}

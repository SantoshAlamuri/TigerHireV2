import type { SupabaseClient } from "@supabase/supabase-js";

export type OfferEventType =
  | "sent"
  | "company_signed"
  | "viewed"
  | "signed"
  | "declined"
  | "expired"
  | "reminder_sent"
  | "downloaded";

export async function insertOfferEvent(
  admin: SupabaseClient,
  params: {
    offerId: string;
    eventType: OfferEventType;
    actorIp?: string | null;
    actorUserAgent?: string | null;
    actorName?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<void> {
  await admin.from("offer_events").insert({
    offer_id: params.offerId,
    event_type: params.eventType,
    actor_ip: params.actorIp ?? null,
    actor_user_agent: params.actorUserAgent ?? null,
    actor_name: params.actorName ?? null,
    metadata: params.metadata ?? null,
  });
}

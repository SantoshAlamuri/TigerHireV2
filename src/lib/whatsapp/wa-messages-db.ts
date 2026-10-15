import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

/**
 * Persists a WhatsApp line item on the application (launch plan `wa_messages`).
 * Idempotent on `wa_message_id` when provided (duplicate inserts ignored).
 */
export async function insertApplicationWaMessage(input: {
  /** When null, the row is still written (e.g. inbound with no resolvable application). */
  applicationId: string | null;
  direction: "in" | "out";
  waMessageId?: string | null;
  templateName?: string | null;
  body?: string | null;
  status?: string | null;
  rawPayload?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createSupabaseAdmin();
    const { error } = await admin.from("wa_messages").insert({
      application_id: input.applicationId,
      direction: input.direction,
      wa_message_id: input.waMessageId ?? null,
      template_name: input.templateName ?? null,
      body: input.body ?? null,
      status: input.status ?? null,
      raw_payload: (input.rawPayload ?? {}) as object,
    });
    if (error) {
      if (error.code === "23505" && input.waMessageId) {
        return;
      }
      logger.warn("wa_messages insert failed", { message: error.message });
    }
  } catch (e) {
    logger.warn("wa_messages insert exception", { error: String(e) });
  }
}

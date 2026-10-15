import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { handleInboundMessage } from "@/lib/whatsapp/handler";

/**
 * Durable, per-phone-serialized inbound WhatsApp processing.
 *
 * The webhook enqueues one event per inbound message; this worker processes it.
 * Two properties the inline `after()` path could not provide:
 *
 *  - Durability: work runs in Inngest's retried worker, not the ephemeral request
 *    isolate, so a crash / redeploy mid-handler no longer permanently loses the
 *    message (Inngest redelivers).
 *  - Per-phone serialization: `concurrency: { key: event.data.phone, limit: 1 }`
 *    guarantees messages, crons, and retries for ONE phone never run
 *    concurrently — which structurally eliminates the interleaved-CAS "clobber"
 *    (two writers overwriting each other's session context) that the stress
 *    suite reproduces. No change to the 28 handler CAS sites is required.
 */
export const WHATSAPP_INBOUND_EVENT = "whatsapp/inbound";

export const whatsappInboundConfig = {
  id: "whatsapp-inbound",
  retries: 3,
  concurrency: { key: "event.data.phone", limit: 1 },
  triggers: { event: WHATSAPP_INBOUND_EVENT },
} as const;

type StepRunner = {
  run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
};

type InboundEventData = {
  phone?: string;
  messageId?: string | null;
  payload?: Parameters<typeof handleInboundMessage>[0];
};

/**
 * The worker body, extracted so it can be unit-tested with a fake `step` without
 * an Inngest runtime. `step.run` memoizes on real Inngest, so on a function retry
 * the idempotency claim replays (does not re-claim) and a successfully-handled
 * message is not re-handled.
 */
export async function handleWhatsappInboundJob(ctx: {
  event: { data?: unknown };
  step: StepRunner;
}): Promise<{ skipped: true } | { deduped: true } | { processed: true }> {
  const data = (ctx.event?.data ?? {}) as InboundEventData;
  const payload = data.payload;
  if (!payload) {
    logger.warn("whatsapp_inbound_event_missing_payload", {});
    return { skipped: true };
  }

  const messageId = data.messageId ?? null;
  if (messageId) {
    const claimed = await ctx.step.run("idempotency-claim", async () => {
      const admin = createSupabaseAdmin();
      const { data: ok, error } = await admin.rpc("webhook_event_try_acquire", {
        p_provider: "whatsapp",
        p_event_id: messageId,
      });
      // Throw so Inngest retries the claim rather than silently proceeding
      // (fail-closed — mirrors the webhook's inline claim behavior).
      if (error) throw new Error(`whatsapp idempotency claim failed: ${error.message}`);
      return ok;
    });
    if (claimed === false) {
      return { deduped: true };
    }
  }

  await ctx.step.run("handle-inbound", async () => {
    await handleInboundMessage(payload);
    return { ok: true };
  });

  return { processed: true };
}

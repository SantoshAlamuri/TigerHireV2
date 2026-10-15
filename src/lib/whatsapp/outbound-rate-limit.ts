import { getRedis } from "@/lib/redis/client";
import { logger } from "@/lib/observability/logger";

export class OutboundThrottleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboundThrottleError";
  }
}

const DEFAULT_LIMIT_PER_SECOND = 80;
const MAX_WAIT_MS = 30_000;
const POLL_SLEEP_MS = 50;

function getLimit(): number {
  const raw = process.env.WHATSAPP_OUTBOUND_PER_SECOND_LIMIT;
  if (!raw) return DEFAULT_LIMIT_PER_SECOND;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT_PER_SECOND;
  return parsed;
}

function bucketKey(nowMs: number): string {
  return `wa:outbound:bucket:${Math.floor(nowMs / 1000)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reserve a per-second outbound slot for WhatsApp sends. Implements a
 * fixed-window token bucket keyed on the current second using INCR + EXPIRE
 * on Upstash Redis. When the window is saturated the caller is parked until
 * the next second window, capped at MAX_WAIT_MS to avoid unbounded queueing.
 *
 * Fails open when Redis is unavailable so a Redis outage does not silently
 * halt all WhatsApp outbound — Meta's own per-second limit remains the hard
 * backstop.
 */
export async function awaitOutboundSlot(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const limit = getLimit();
  const startedAt = Date.now();

  while (true) {
    const now = Date.now();
    const key = bucketKey(now);

    let count: number;
    try {
      count = await redis.incr(key);
      if (count === 1) {
        // First increment in this window — expire after 2s so the key is
        // collected even if the process dies before any future writes.
        await redis.expire(key, 2);
      }
    } catch (err) {
      logger.warn("whatsapp_outbound_throttle_redis_error", {
        event_name: "whatsapp_outbound_throttle_redis_error",
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    if (count <= limit) return;

    const elapsed = Date.now() - startedAt;
    if (elapsed >= MAX_WAIT_MS) {
      throw new OutboundThrottleError(
        `WhatsApp outbound throttle exceeded ${MAX_WAIT_MS}ms wait (limit=${limit}/s)`,
      );
    }

    const nextWindowMs = (Math.floor(now / 1000) + 1) * 1000 - now;
    const remainingBudget = MAX_WAIT_MS - elapsed;
    await sleep(Math.min(Math.max(nextWindowMs, POLL_SLEEP_MS), remainingBudget));
  }
}

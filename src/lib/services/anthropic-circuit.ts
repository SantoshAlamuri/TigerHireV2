import { logger } from "@/lib/observability/logger";
import { getRedis } from "@/lib/redis/client";
import { captureSentryMessage } from "@/lib/observability/sentry";

const CIRCUIT_OPEN_TTL_SECONDS = 30;
const FAILURE_WINDOW_SECONDS = 60;
const FAILURE_THRESHOLD = 5;

const OPEN_KEY = "circuit:anthropic:open";
const FAILURES_KEY = "circuit:anthropic:failures";

export class AnthropicCircuitOpenError extends Error {
  constructor() {
    super("Anthropic circuit is open");
    this.name = "AnthropicCircuitOpenError";
  }
}

async function isCircuitOpen(): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    const value = await redis.get(OPEN_KEY);
    return value != null;
  } catch (error) {
    captureSentryMessage("Redis read failed for anthropic circuit", "warning", {
      tags: { service: "redis", component: "anthropic_circuit" },
      extra: { op: "get_open_key", error: error instanceof Error ? error.message : String(error) },
    });
    return false;
  }
}

async function markFailure(label?: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const current = await redis.incr(FAILURES_KEY);
    if (current === 1) {
      await redis.expire(FAILURES_KEY, FAILURE_WINDOW_SECONDS);
    }
    if (current >= FAILURE_THRESHOLD) {
      await redis.setex(OPEN_KEY, CIRCUIT_OPEN_TTL_SECONDS, "1");
      logger.warn("Anthropic circuit opened", {
        label,
        failuresInWindow: current,
      });
      captureSentryMessage("Anthropic circuit transitioned to open", "warning", {
        tags: { "circuit.state": "open", service: "anthropic" },
        extra: {
          label: label ?? null,
          failuresInWindow: current,
          openTtlSeconds: CIRCUIT_OPEN_TTL_SECONDS,
        },
      });
    }
  } catch (error) {
    logger.warn("Anthropic failure counter update failed", {
      label,
      error: error instanceof Error ? error.message : String(error),
    });
    captureSentryMessage("Redis write failed for anthropic circuit failure counter", "warning", {
      tags: { service: "redis", component: "anthropic_circuit" },
      extra: {
        op: "mark_failure",
        label: label ?? null,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

async function markSuccess(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(OPEN_KEY);
    await redis.del(FAILURES_KEY);
  } catch {
    captureSentryMessage("Redis cleanup failed for anthropic circuit", "warning", {
      tags: { service: "redis", component: "anthropic_circuit" },
      extra: { op: "mark_success_cleanup" },
    });
  }
}

export async function runWithAnthropicCircuit<T>(
  fn: () => Promise<T>,
  options?: { label?: string },
): Promise<T> {
  if (await isCircuitOpen()) {
    captureSentryMessage("Anthropic circuit open - fail fast", "warning", {
      tags: { "circuit.state": "open", service: "anthropic" },
      extra: { label: options?.label ?? null },
    });
    throw new AnthropicCircuitOpenError();
  }
  try {
    const result = await fn();
    await markSuccess();
    return result;
  } catch (error) {
    if (isAnthropicDeferableError(error)) {
      await markFailure(options?.label);
    }
    throw error;
  }
}

export function isAnthropicDeferableError(error: unknown): boolean {
  if (error instanceof AnthropicCircuitOpenError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return (
    /429|503|504|rate limit|timeout|timed out|aborted|circuit/i.test(message) ||
    /overloaded|temporarily unavailable/i.test(message)
  );
}

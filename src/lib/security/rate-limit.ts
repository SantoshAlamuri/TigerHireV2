import type { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

/** Presets for consistent limits across public and mutation endpoints. */
export const RATE_LIMIT_PRESETS = {
  /** Login, register – strict to reduce brute force. */
  auth: { limit: 10, windowSecs: 60 },
  /** Public apply form. */
  apply: { limit: 20, windowSecs: 60 },
  /** Contact, waitlist. */
  publicForm: { limit: 15, windowSecs: 60 },
  /** Webhooks (by signature/idempotency in addition). */
  webhook: { limit: 100, windowSecs: 60 },
  /** Signals ingest (cron or super_admin). */
  ingest: { limit: 30, windowSecs: 60 },
  /** Uploads (resume, JD, profile). */
  upload: { limit: 20, windowSecs: 60 },
  /** Default for other mutation endpoints. */
  default: { limit: 30, windowSecs: 60 },
} as const;

interface RateLimitConfig {
  key: string;
  limit: number;
  windowSecs: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

interface ScopedRateLimitKeyInput {
  route: string;
  userId?: string | null;
  organisationId?: string | null;
  ip?: string | null;
  suffix?: string | null;
}

/**
 * Builds stable rate-limit keys with org-aware scoping for authenticated endpoints.
 * Priority: route:org:user[:suffix] -> route:user[:suffix] -> route:ip[:suffix].
 */
/** First IP in X-Forwarded-For, or X-Real-IP, for unauthenticated rate limits. */
export function getClientIpForRateLimit(request: NextRequest | { headers: Headers }): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export function buildScopedRateLimitKey(input: ScopedRateLimitKeyInput): string {
  const route = input.route.trim();
  const suffix = input.suffix?.trim();
  const append = (base: string) => (suffix ? `${base}:${suffix}` : base);

  if (input.organisationId && input.userId) {
    return append(`${route}:${input.organisationId}:${input.userId}`);
  }
  if (input.userId) return append(`${route}:${input.userId}`);
  if (input.ip) return append(`${route}:${input.ip}`);
  return append(`${route}:anonymous`);
}

/**
 * Atomic rate limiter using a Postgres function to claim-and-count in a single
 * round-trip, eliminating the race condition in the old insert-then-count pattern.
 * Falls back to the in-app approach when the RPC is unavailable.
 */
export async function checkRateLimit(config: RateLimitConfig): Promise<RateLimitResult> {
  const supabase = createSupabaseAdmin();
  const windowStart = new Date(Date.now() - config.windowSecs * 1000).toISOString();

  const { data, error } = await supabase.rpc("check_rate_limit_atomic", {
    p_key: config.key,
    p_window_start: windowStart,
    p_limit: config.limit,
  });

  if (!error && data !== null) {
    const current = data as number;
    const allowed = current <= config.limit;

    if (!allowed) {
      logger.warn("Rate limit exceeded", {
        user_id: config.key,
        message: `${current}/${config.limit} in ${config.windowSecs}s`,
      });
    }

    return {
      allowed,
      remaining: Math.max(0, config.limit - current),
      resetAt: new Date(Date.now() + config.windowSecs * 1000),
    };
  }

  // RPC unavailable: fail closed (deny) to avoid bypassing rate limits.
  logger.error("Rate limit RPC unavailable — denying request for safety", {
    error: error?.message,
    key: config.key,
  });

  return {
    allowed: false,
    remaining: 0,
    resetAt: new Date(Date.now() + config.windowSecs * 1000),
  };
}

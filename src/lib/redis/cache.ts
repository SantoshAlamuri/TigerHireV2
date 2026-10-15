import { logger } from "@/lib/observability/logger";
import { getRedis } from "./client";
import { captureSentryMessage } from "@/lib/observability/sentry";

const DEFAULT_TTL_SEC = 300; // 5 minutes
const REDIS_RETRY_DELAY_MS = 80;

/** In-memory counters for cache hit/miss (best-effort metrics) */
const cacheHitCount = { value: 0 };
const cacheMissCount = { value: 0 };

/** When true, cache operations log latency and hit/miss (e.g. DEBUG_CACHE=1). */
const debugCache = process.env.DEBUG_CACHE === "1";

export function getCacheMetrics(): { hits: number; misses: number } {
  return { hits: cacheHitCount.value, misses: cacheMissCount.value };
}

/** Run fn, retry once on failure after a short delay (transient Redis/network). */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    await new Promise((r) => setTimeout(r, REDIS_RETRY_DELAY_MS));
    return fn();
  }
}

/**
 * Get a value from Redis cache. Returns null if key not found or Redis unavailable.
 * Retries once on failure; optional latency logging when DEBUG_CACHE=1.
 */
export async function cacheGet<T = string>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;
  const start = debugCache ? Date.now() : 0;
  try {
    const raw = await withRetry(() => redis.get(key));
    if (debugCache) {
      console.debug("[cache] get", key, `${Date.now() - start}ms`, raw == null ? "miss" : "hit");
    }
    if (raw == null) {
      cacheMissCount.value += 1;
      return null;
    }
    cacheHitCount.value += 1;
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw) as T;
      } catch {
        return raw as unknown as T;
      }
    }
    return raw as T;
  } catch {
    captureSentryMessage("Redis cache get failed", "warning", {
      tags: { service: "redis", component: "cache" },
      extra: { op: "get", key },
    });
    return null;
  }
}

/**
 * Set a value in Redis cache. No-op if Redis unavailable.
 * Retries once on failure; optional latency logging when DEBUG_CACHE=1.
 */
export async function cacheSet(
  key: string,
  value: unknown,
  ttlSec: number = DEFAULT_TTL_SEC,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const start = debugCache ? Date.now() : 0;
  try {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    await withRetry(() => redis.setex(key, ttlSec, serialized));
    if (debugCache) console.debug("[cache] set", key, `${Date.now() - start}ms`);
  } catch (err) {
    logger.warn("Cache set failed", { key, error: String(err) });
    captureSentryMessage("Redis cache set failed", "warning", {
      tags: { service: "redis", component: "cache" },
      extra: { op: "set", key, error: String(err) },
    });
  }
}

/**
 * Delete a key from Redis cache. No-op if Redis unavailable.
 * Retries once on failure.
 */
export async function cacheDel(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await withRetry(() => redis.del(key));
  } catch (err) {
    logger.warn("Cache del failed", { key, error: String(err) });
    captureSentryMessage("Redis cache del failed", "warning", {
      tags: { service: "redis", component: "cache" },
      extra: { op: "del", key, error: String(err) },
    });
  }
}

/**
 * Delete all keys matching a glob pattern (admin-only invalidation paths).
 * Best-effort helper for sparse mutation events.
 */
export async function cacheDelByPattern(pattern: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const keys = (await withRetry(() => redis.keys(pattern))) as string[];
    if (!keys.length) return;
    await Promise.all(keys.map((key) => withRetry(() => redis.del(key))));
  } catch (err) {
    logger.warn("Cache pattern del failed", { pattern, error: String(err) });
    captureSentryMessage("Redis cache pattern del failed", "warning", {
      tags: { service: "redis", component: "cache" },
      extra: { op: "del_pattern", pattern, error: String(err) },
    });
  }
}

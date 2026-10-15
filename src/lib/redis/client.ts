import { Redis } from "@upstash/redis";
import { env } from "@/lib/config/env";
import { captureSentryMessage } from "@/lib/observability/sentry";

let client: Redis | null = null;

/**
 * Get Upstash Redis client. Returns null if Redis is not configured
 * (UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN not set).
 */
export function getRedis(): Redis | null {
  if (!env.redisRestUrl || !env.redisRestToken) return null;
  if (!client) {
    try {
      client = new Redis({
        url: env.redisRestUrl,
        token: env.redisRestToken,
      });
    } catch (error) {
      captureSentryMessage("Redis client creation failed", "warning", {
        tags: { service: "redis", component: "client" },
        extra: { error: error instanceof Error ? error.message : String(error) },
      });
      return null;
    }
  }
  return client;
}

/**
 * Check if Redis is configured and reachable.
 */
export async function checkRedis(): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    await redis.ping();
    return true;
  } catch (error) {
    captureSentryMessage("Redis ping failed", "warning", {
      tags: { service: "redis", component: "healthcheck" },
      extra: { error: error instanceof Error ? error.message : String(error) },
    });
    return false;
  }
}

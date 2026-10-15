import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { cacheDel, cacheDelByPattern, cacheGet, cacheSet } from "@/lib/redis/cache";
import {
  CacheTTL,
  featureFlagKey,
  orgFeatureFlagKey,
  orgFeatureFlagPrefix,
} from "@/lib/redis/keys";

const memoryCache = new Map<string, { value: boolean; cachedAt: number }>();
const MEMORY_TTL_MS = 30_000;
const ACK_MEMORY_TTL_MS = 1_000;
const ACK_REDIS_TTL_SEC = 2;

function resolveMemoryTtlMs(flagKey: string): number {
  return flagKey.startsWith("ack_") ? ACK_MEMORY_TTL_MS : MEMORY_TTL_MS;
}

function resolveRedisTtlSec(flagKey: string): number {
  return flagKey.startsWith("ack_") ? ACK_REDIS_TTL_SEC : CacheTTL.FEATURE_FLAG_SEC;
}

function normalizeOrganisationId(organisationId: string | null | undefined): string | null {
  if (!organisationId) return null;
  const trimmed = organisationId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveCacheId(flagKey: string, organisationId: string | null): string {
  return `${organisationId ?? "global"}:${flagKey}`;
}

function resolveRedisKey(flagKey: string, organisationId: string | null): string {
  return organisationId ? orgFeatureFlagKey(organisationId, flagKey) : featureFlagKey(flagKey);
}

export async function isEnabled(flagKey: string, organisationId?: string | null): Promise<boolean> {
  const orgId = normalizeOrganisationId(organisationId);
  const cacheId = resolveCacheId(flagKey, orgId);
  const redisKey = resolveRedisKey(flagKey, orgId);
  const memoryTtlMs = resolveMemoryTtlMs(flagKey);

  const fromMemory = memoryCache.get(cacheId);
  if (fromMemory && Date.now() - fromMemory.cachedAt < memoryTtlMs) {
    return fromMemory.value;
  }

  const fromRedis = await cacheGet<boolean>(redisKey);
  if (typeof fromRedis === "boolean") {
    memoryCache.set(cacheId, { value: fromRedis, cachedAt: Date.now() });
    return fromRedis;
  }

  try {
    const supabase = createSupabaseAdmin();
    const { data: globalData } = await supabase
      .from("feature_flags")
      .select("enabled")
      .eq("key", flagKey)
      .single();

    // Missing global rows should not auto-enable runtime flags.
    let enabled = globalData?.enabled ?? false;
    if (orgId) {
      const { data: orgOverride } = await supabase
        .from("organisation_runtime_feature_flag_overrides")
        .select("enabled")
        .eq("organisation_id", orgId)
        .eq("flag_key", flagKey)
        .maybeSingle();
      if (orgOverride) {
        enabled = Boolean(orgOverride.enabled);
      }
    }

    memoryCache.set(cacheId, { value: enabled, cachedAt: Date.now() });
    await cacheSet(redisKey, enabled, resolveRedisTtlSec(flagKey));
    return enabled;
  } catch {
    logger.warn("Feature flag lookup failed, failing closed (disabled)", {
      message: flagKey,
    });
    return false;
  }
}

export async function getEnabledFlags(
  flagKeys: string[],
  organisationId?: string | null,
): Promise<Record<string, boolean>> {
  const orgId = normalizeOrganisationId(organisationId);
  const uniqueKeys = [...new Set(flagKeys)];
  if (uniqueKeys.length === 0) return {};

  const now = Date.now();
  const results: Record<string, boolean> = {};
  const missingRedisKeys: string[] = [];

  for (const flagKey of uniqueKeys) {
    const cacheId = resolveCacheId(flagKey, orgId);
    const fromMemory = memoryCache.get(cacheId);
    if (fromMemory && now - fromMemory.cachedAt < resolveMemoryTtlMs(flagKey)) {
      results[flagKey] = fromMemory.value;
      continue;
    }
    missingRedisKeys.push(flagKey);
  }

  await Promise.all(
    missingRedisKeys.map(async (flagKey) => {
      const cacheId = resolveCacheId(flagKey, orgId);
      const cached = await cacheGet<boolean>(resolveRedisKey(flagKey, orgId));
      if (typeof cached === "boolean") {
        memoryCache.set(cacheId, { value: cached, cachedAt: Date.now() });
        results[flagKey] = cached;
      }
    }),
  );

  const dbKeys = missingRedisKeys.filter((flagKey) => !(flagKey in results));
  if (dbKeys.length === 0) return results;

  try {
    const supabase = createSupabaseAdmin();
    const { data } = await supabase.from("feature_flags").select("key, enabled").in("key", dbKeys);
    const defaultMap = new Map(
      (data ?? []).map((row) => [row.key as string, Boolean(row.enabled)]),
    );

    const overrideMap = new Map<string, boolean>();
    if (orgId) {
      const { data: overrides } = await supabase
        .from("organisation_runtime_feature_flag_overrides")
        .select("flag_key, enabled")
        .eq("organisation_id", orgId)
        .in("flag_key", dbKeys);
      for (const row of overrides ?? []) {
        overrideMap.set(String(row.flag_key), Boolean(row.enabled));
      }
    }

    await Promise.all(
      dbKeys.map(async (flagKey) => {
        const enabled = overrideMap.has(flagKey)
          ? Boolean(overrideMap.get(flagKey))
          : (defaultMap.get(flagKey) ?? false);
        results[flagKey] = enabled;
        memoryCache.set(resolveCacheId(flagKey, orgId), { value: enabled, cachedAt: Date.now() });
        await cacheSet(resolveRedisKey(flagKey, orgId), enabled, resolveRedisTtlSec(flagKey));
      }),
    );

    return results;
  } catch {
    for (const flagKey of dbKeys) {
      logger.warn("Feature flag lookup failed, failing closed (disabled)", {
        message: flagKey,
      });
      results[flagKey] = false;
    }
    return results;
  }
}

/** Clear the in-memory cache (useful in tests). */
export function clearFlagCache(): void {
  memoryCache.clear();
}

export async function invalidateFeatureFlagCache(
  flagKey?: string,
  organisationId?: string | null,
): Promise<void> {
  if (!flagKey) {
    clearFlagCache();
    return;
  }
  const orgId = normalizeOrganisationId(organisationId);
  if (orgId) {
    memoryCache.delete(resolveCacheId(flagKey, orgId));
    await cacheDel(orgFeatureFlagKey(orgId, flagKey));
    return;
  }

  // Global default changed: clear all in-memory entries for this flag
  // (global + org-derived) and invalidate Redis keys.
  for (const key of memoryCache.keys()) {
    if (key.endsWith(`:${flagKey}`)) {
      memoryCache.delete(key);
    }
  }
  await cacheDel(featureFlagKey(flagKey));
  await cacheDelByPattern(orgFeatureFlagPrefix(flagKey));
}

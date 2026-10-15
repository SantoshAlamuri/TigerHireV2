import type { UserRole } from "@/types";
import { cacheGet, cacheSet, cacheDel } from "./cache";
import { authProfileKey, CacheTTL } from "./keys";

export interface CachedAuthProfile {
  role: UserRole;
  organisation_id: string | null;
  is_active: boolean;
  role_status?: "pending" | "active" | "suspended";
  /**
   * REQUIRED on writes: every setCachedAuthProfile caller shares this cache
   * with getAuthContext(), which resolves `?? false` on hits. Two prod
   * incidents (proxy.ts, api-account-status.ts) came from writers omitting
   * this field and silently demoting platform admins for the cache TTL.
   * Reads may still see `undefined` from pre-migration blobs (60s TTL).
   */
  is_platform_admin: boolean;
  /** Org product setup (Brief 1); optional for older cache payloads. */
  is_org_admin?: boolean;
}

/** In dev only: avoid Supabase/Redis round-trip on every request. */
const devMemoryCache = new Map<string, { profile: CachedAuthProfile; expiresAt: number }>();
const isDev = process.env.NODE_ENV === "development";

export async function getCachedAuthProfile(userId: string): Promise<CachedAuthProfile | null> {
  if (isDev) {
    const entry = devMemoryCache.get(userId);
    if (entry && entry.expiresAt > Date.now()) return entry.profile;
    if (entry) devMemoryCache.delete(userId);
  }

  const fromRedis = await cacheGet<CachedAuthProfile>(authProfileKey(userId));
  if (isDev && fromRedis) {
    devMemoryCache.set(userId, {
      profile: fromRedis,
      expiresAt: Date.now() + CacheTTL.AUTH_PROFILE_SEC * 1000,
    });
  }
  return fromRedis;
}

export async function setCachedAuthProfile(
  userId: string,
  profile: CachedAuthProfile,
): Promise<void> {
  if (isDev) {
    devMemoryCache.set(userId, {
      profile,
      expiresAt: Date.now() + CacheTTL.AUTH_PROFILE_SEC * 1000,
    });
  }
  await cacheSet(authProfileKey(userId), profile, CacheTTL.AUTH_PROFILE_SEC);
}

export async function deleteCachedAuthProfile(userId: string): Promise<void> {
  if (isDev) devMemoryCache.delete(userId);
  await cacheDel(authProfileKey(userId));
}

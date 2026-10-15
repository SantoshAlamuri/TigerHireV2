import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@/types";
import {
  getCachedAuthProfile,
  setCachedAuthProfile,
  type CachedAuthProfile,
} from "@/lib/redis/auth-profile-cache";

/**
 * Why an authenticated user is blocked from protected APIs, or null if allowed.
 * Mirrors the dashboard middleware's account-status checks (is_active /
 * role_status) so a protected `/api/*` route can't be reached by a
 * suspended / pending / deactivated account just because the route forgot to
 * call getAuthContext() (security audit Finding C).
 */
export type ApiAccountDenyReason = "inactive" | "pending" | "suspended" | null;

function denyReasonFor(profile: {
  is_active?: boolean;
  role_status?: "pending" | "active" | "suspended";
}): ApiAccountDenyReason {
  if (profile.is_active === false) return "inactive";
  if (profile.role_status === "suspended") return "suspended";
  if (profile.role_status === "pending") return "pending";
  return null;
}

/**
 * Resolve the account-status deny reason for a user from the cached auth
 * profile (populated by the dashboard middleware path) or, on a cache miss, a
 * single profile read that also warms the cache.
 *
 * Returns null (allow) when status can't be determined — a transient read
 * error or a legacy DB without is_active/role_status must not 403 every API
 * call. Route-level getAuthContext() remains the defense-in-depth check.
 */
export interface ApiAccountStatus {
  denyReason: ApiAccountDenyReason;
  /**
   * The resolved auth profile (cache hit, or DB-fetched on miss), or null when
   * none exists. Returned so the caller can reuse it for the org-activation
   * gate instead of issuing a second getCachedAuthProfile read per request.
   */
  profile: CachedAuthProfile | null;
}

/**
 * Resolve the account-status deny reason AND the underlying profile in a single
 * cache read (+ one DB read on miss). Callers should reuse `.profile` to avoid
 * redundant cache lookups in the same request.
 */
export async function resolveApiAccountStatus(
  supabase: SupabaseClient,
  userId: string,
): Promise<ApiAccountStatus> {
  const cached = await getCachedAuthProfile(userId).catch(() => null);
  if (cached) {
    return { denyReason: denyReasonFor(cached), profile: cached };
  }

  try {
    // Must stay a superset of what getAuthContext() caches — this write shares
    // the auth-profile cache, and any field omitted here reads back as `false`
    // for every cache hit during the TTL. Omitting is_platform_admin from this
    // exact select 403'd platform-admin panels in prod (same bug as proxy.ts).
    const { data, error } = await supabase
      .from("profiles")
      .select("role, organisation_id, is_active, role_status, is_org_admin, is_platform_admin")
      .eq("id", userId)
      .single();
    if (error || !data) return { denyReason: null, profile: null };

    const row = data as {
      role?: UserRole;
      organisation_id?: string | null;
      is_active?: boolean;
      role_status?: "pending" | "active" | "suspended";
      is_org_admin?: boolean;
      is_platform_admin?: boolean;
    };
    if (!row.role) return { denyReason: null, profile: null };

    const profile: CachedAuthProfile = {
      role: row.role,
      organisation_id: row.organisation_id ?? null,
      is_active: row.is_active !== false,
      role_status: row.role_status ?? "active",
      is_org_admin: Boolean(row.is_org_admin),
      is_platform_admin: Boolean(row.is_platform_admin),
    };
    // Warm the cache for the dashboard path and subsequent API calls.
    await setCachedAuthProfile(userId, profile).catch(() => null);
    return { denyReason: denyReasonFor(profile), profile };
  } catch {
    return { denyReason: null, profile: null };
  }
}

/** Back-compat thin wrapper — prefer resolveApiAccountStatus to also get the profile. */
export async function resolveApiAccountDenyReason(
  supabase: SupabaseClient,
  userId: string,
): Promise<ApiAccountDenyReason> {
  return (await resolveApiAccountStatus(supabase, userId)).denyReason;
}

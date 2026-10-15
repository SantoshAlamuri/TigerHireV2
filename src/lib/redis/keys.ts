/**
 * Redis cache key schema and TTLs per domain.
 * Single place for key prefixes and invalidation policy (see docs/DB_AUDIT_AGENTDB_ADVANCED.md).
 */

export const CacheDomain = {
  /** Auth profile (role, organisation_id) — invalidate on profile update or logout. */
  AUTH_PROFILE: "auth:profile:",
  /** GET /api/my-pipeline response — invalidate on pipeline/backfill/reprocess. */
  MY_PIPELINE: "my-pipeline:",
  /** Feature flags — short TTL so toggles propagate without deploy. */
  FEATURE_FLAG: "feature-flag:",
  /** Organisation feature entitlement decisions. */
  ORG_ENTITLEMENT: "org-entitlement:",
} as const;

/** TTL in seconds per domain. */
export const CacheTTL = {
  /** 1 minute; balances latency vs freshness for role/org. */
  AUTH_PROFILE_SEC: 60,
  /** 25s; short enough that refetch after backfill sees new data quickly. */
  MY_PIPELINE_SEC: 25,
  /** 30s for feature flags; circuit breaker avoids DB on every score. */
  FEATURE_FLAG_SEC: 30,
  /** 30s for entitlement resolution to keep admin updates near-real-time. */
  ORG_ENTITLEMENT_SEC: 30,
  /** Default for ad-hoc keys (e.g. 5 min). */
  DEFAULT_SEC: 300,
} as const;

export function authProfileKey(userId: string): string {
  return `${CacheDomain.AUTH_PROFILE}v2:${userId}`;
}

export function myPipelineKey(userId: string): string {
  return CacheDomain.MY_PIPELINE + userId;
}

export function featureFlagKey(flagKey: string): string {
  return CacheDomain.FEATURE_FLAG + flagKey;
}

export function orgFeatureFlagKey(organisationId: string, flagKey: string): string {
  return `${CacheDomain.FEATURE_FLAG}${organisationId}:${flagKey}`;
}

export function orgFeatureFlagPrefix(flagKey: string): string {
  return `${CacheDomain.FEATURE_FLAG}*:${flagKey}`;
}

export function orgEntitlementKey(organisationId: string, featureKey: string): string {
  return `${CacheDomain.ORG_ENTITLEMENT}${organisationId}:${featureKey}`;
}

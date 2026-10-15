import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getEnabledFlags, isEnabled } from "@/lib/feature-flags";
import { logger } from "@/lib/observability/logger";
import { cacheDel, cacheGet, cacheSet } from "@/lib/redis/cache";
import { CacheTTL, orgEntitlementKey } from "@/lib/redis/keys";
import { effectiveCompanyPlan } from "@/lib/services/billing-provider";
import {
  ENTITLEMENT_FEATURE_KEYS,
  GLOBAL_KILL_SWITCH_BY_FEATURE,
  type EntitlementFeatureKey,
} from "@/lib/entitlements/config";

type EntitlementSource = "no_org" | "plan_default" | "org_override";

export interface EntitlementDecision {
  allowed: boolean;
  reason: string;
  source: EntitlementSource;
  featureKey: EntitlementFeatureKey;
  organisationId: string | null;
}

const memoryCache = new Map<string, { value: EntitlementDecision; at: number }>();
const MEMORY_TTL_MS = 30_000;
const entitlementMetrics = {
  allowed: 0,
  denied: 0,
};

function extractPlanFeatureDefault(limits: unknown, featureKey: EntitlementFeatureKey): boolean {
  if (!limits || typeof limits !== "object") return true;
  const features = (limits as { features?: unknown }).features;
  if (!features || typeof features !== "object") return true;
  const v = (features as Record<string, unknown>)[featureKey];
  return typeof v === "boolean" ? v : true;
}

function logDecision(decision: EntitlementDecision): void {
  if (decision.allowed) entitlementMetrics.allowed += 1;
  else entitlementMetrics.denied += 1;
  logger.info("Entitlement decision", {
    feature_key: decision.featureKey,
    org_id: decision.organisationId,
    allowed: decision.allowed,
    reason: decision.reason,
    source: decision.source,
  });
}

function buildDecision(params: {
  allowed: boolean;
  reason: string;
  source: EntitlementSource;
  featureKey: EntitlementFeatureKey;
  organisationId: string | null;
}): EntitlementDecision {
  return {
    allowed: params.allowed,
    reason: params.reason,
    source: params.source,
    featureKey: params.featureKey,
    organisationId: params.organisationId,
  };
}

export async function getOrganisationEntitlement(
  organisationId: string | null | undefined,
  featureKey: EntitlementFeatureKey,
): Promise<EntitlementDecision> {
  const orgId = organisationId ?? null;
  const globalKillSwitch = GLOBAL_KILL_SWITCH_BY_FEATURE[featureKey];
  const globallyEnabled = await isEnabled(globalKillSwitch, orgId);
  if (!globallyEnabled) {
    const decision: EntitlementDecision = {
      allowed: false,
      reason: `Global kill switch disabled: ${globalKillSwitch}`,
      source: "plan_default",
      featureKey,
      organisationId: orgId,
    };
    logDecision(decision);
    return decision;
  }

  if (!orgId) {
    const decision: EntitlementDecision = {
      allowed: true,
      reason: "No organisation scope available; allowing by default",
      source: "no_org",
      featureKey,
      organisationId: null,
    };
    logDecision(decision);
    return decision;
  }

  const cacheKey = orgEntitlementKey(orgId, featureKey);
  const fromMemory = memoryCache.get(cacheKey);
  if (fromMemory && Date.now() - fromMemory.at < MEMORY_TTL_MS) {
    return fromMemory.value;
  }

  const fromRedis = await cacheGet<EntitlementDecision>(cacheKey);
  if (fromRedis) {
    memoryCache.set(cacheKey, { value: fromRedis, at: Date.now() });
    return fromRedis;
  }

  const admin = createSupabaseAdmin();
  const { data: org, error: orgError } = await admin
    .from("organisations")
    .select("id, company_plan")
    .eq("id", orgId)
    .single();
  if (orgError || !org) {
    const decision: EntitlementDecision = {
      allowed: false,
      reason: "Organisation not found",
      source: "plan_default",
      featureKey,
      organisationId: orgId,
    };
    logDecision(decision);
    return decision;
  }

  const { data: subscription } = await admin
    .from("subscriptions")
    .select("status")
    .eq("organisation_id", orgId)
    .maybeSingle();
  const planKey = effectiveCompanyPlan({
    plan: (org.company_plan as string | null) ?? "starter",
    subscriptionStatus: subscription?.status ?? null,
  });
  const { data: planRow } = await admin
    .from("billing_plans")
    .select("limits")
    .eq("plan_type", "company")
    .eq("plan_key", planKey)
    .maybeSingle();

  const planAllowed = extractPlanFeatureDefault(planRow?.limits, featureKey);
  const { data: overrideRow } = await admin
    .from("organisation_feature_overrides")
    .select("enabled")
    .eq("organisation_id", orgId)
    .eq("feature_key", featureKey)
    .maybeSingle();

  const allowed = overrideRow ? Boolean(overrideRow.enabled) : planAllowed;
  const decision: EntitlementDecision = {
    allowed,
    reason: overrideRow
      ? `Organisation override set to ${overrideRow.enabled ? "enabled" : "disabled"}`
      : `Plan ${planKey} default is ${planAllowed ? "enabled" : "disabled"}`,
    source: overrideRow ? "org_override" : "plan_default",
    featureKey,
    organisationId: orgId,
  };
  memoryCache.set(cacheKey, { value: decision, at: Date.now() });
  await cacheSet(cacheKey, decision, CacheTTL.ORG_ENTITLEMENT_SEC);
  logDecision(decision);
  return decision;
}

export async function requireOrganisationEntitlement(
  organisationId: string | null | undefined,
  featureKey: EntitlementFeatureKey,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const decision = await getOrganisationEntitlement(organisationId, featureKey);
  if (decision.allowed) return { ok: true };
  return { ok: false, message: decision.reason };
}

export async function getOrganisationEntitlements(
  organisationId: string | null | undefined,
  featureKeys: readonly EntitlementFeatureKey[] = ENTITLEMENT_FEATURE_KEYS,
): Promise<Record<EntitlementFeatureKey, EntitlementDecision>> {
  const orgId = organisationId ?? null;
  const uniqueFeatureKeys = [...new Set(featureKeys)] as EntitlementFeatureKey[];
  const results = {} as Record<EntitlementFeatureKey, EntitlementDecision>;

  const killSwitches = uniqueFeatureKeys.map(
    (featureKey) => GLOBAL_KILL_SWITCH_BY_FEATURE[featureKey],
  );
  const globalFlags = await getEnabledFlags(killSwitches, orgId);
  const liveFeatureKeys = uniqueFeatureKeys.filter((featureKey) => {
    const enabled = globalFlags[GLOBAL_KILL_SWITCH_BY_FEATURE[featureKey]];
    if (enabled) return true;
    const decision = buildDecision({
      allowed: false,
      reason: `Global kill switch disabled: ${GLOBAL_KILL_SWITCH_BY_FEATURE[featureKey]}`,
      source: "plan_default",
      featureKey,
      organisationId: orgId,
    });
    logDecision(decision);
    results[featureKey] = decision;
    return false;
  });

  if (!orgId) {
    for (const featureKey of liveFeatureKeys) {
      const decision = buildDecision({
        allowed: true,
        reason: "No organisation scope available; allowing by default",
        source: "no_org",
        featureKey,
        organisationId: null,
      });
      logDecision(decision);
      results[featureKey] = decision;
    }
    return results;
  }

  const missingFeatureKeys: EntitlementFeatureKey[] = [];
  for (const featureKey of liveFeatureKeys) {
    const cacheKey = orgEntitlementKey(orgId, featureKey);
    const fromMemory = memoryCache.get(cacheKey);
    if (fromMemory && Date.now() - fromMemory.at < MEMORY_TTL_MS) {
      results[featureKey] = fromMemory.value;
      continue;
    }

    const fromRedis = await cacheGet<EntitlementDecision>(cacheKey);
    if (fromRedis) {
      memoryCache.set(cacheKey, { value: fromRedis, at: Date.now() });
      results[featureKey] = fromRedis;
      continue;
    }

    missingFeatureKeys.push(featureKey);
  }

  if (missingFeatureKeys.length === 0) return results;

  const admin = createSupabaseAdmin();
  const { data: org, error: orgError } = await admin
    .from("organisations")
    .select("id, company_plan")
    .eq("id", orgId)
    .single();

  if (orgError || !org) {
    for (const featureKey of missingFeatureKeys) {
      const decision = buildDecision({
        allowed: false,
        reason: "Organisation not found",
        source: "plan_default",
        featureKey,
        organisationId: orgId,
      });
      logDecision(decision);
      results[featureKey] = decision;
    }
    return results;
  }

  const { data: subscription } = await admin
    .from("subscriptions")
    .select("status")
    .eq("organisation_id", orgId)
    .maybeSingle();
  const planKey = effectiveCompanyPlan({
    plan: (org.company_plan as string | null) ?? "starter",
    subscriptionStatus: subscription?.status ?? null,
  });
  const [{ data: planRow }, { data: overrideRows }] = await Promise.all([
    admin
      .from("billing_plans")
      .select("limits")
      .eq("plan_type", "company")
      .eq("plan_key", planKey)
      .maybeSingle(),
    admin
      .from("organisation_feature_overrides")
      .select("feature_key, enabled")
      .eq("organisation_id", orgId)
      .in("feature_key", missingFeatureKeys),
  ]);

  const overrideMap = new Map(
    (overrideRows ?? []).map((row) => [
      row.feature_key as EntitlementFeatureKey,
      Boolean(row.enabled),
    ]),
  );

  await Promise.all(
    missingFeatureKeys.map(async (featureKey) => {
      const planAllowed = extractPlanFeatureDefault(planRow?.limits, featureKey);
      const hasOverride = overrideMap.has(featureKey);
      const allowed = hasOverride ? Boolean(overrideMap.get(featureKey)) : planAllowed;
      const decision = buildDecision({
        allowed,
        reason: hasOverride
          ? `Organisation override set to ${overrideMap.get(featureKey) ? "enabled" : "disabled"}`
          : `Plan ${planKey} default is ${planAllowed ? "enabled" : "disabled"}`,
        source: hasOverride ? "org_override" : "plan_default",
        featureKey,
        organisationId: orgId,
      });
      const cacheKey = orgEntitlementKey(orgId, featureKey);
      memoryCache.set(cacheKey, { value: decision, at: Date.now() });
      await cacheSet(cacheKey, decision, CacheTTL.ORG_ENTITLEMENT_SEC);
      logDecision(decision);
      results[featureKey] = decision;
    }),
  );

  return results;
}

export async function invalidateOrganisationEntitlement(
  organisationId: string,
  featureKey?: EntitlementFeatureKey,
): Promise<void> {
  if (featureKey) {
    const key = orgEntitlementKey(organisationId, featureKey);
    memoryCache.delete(key);
    await cacheDel(key);
    return;
  }
  // Unknown keys for this org in memory: best effort local clear.
  const prefix = orgEntitlementKey(organisationId, "");
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) memoryCache.delete(key);
  }
}

export function clearEntitlementMemoryCache(): void {
  memoryCache.clear();
}

export function getEntitlementMetrics(): { allowed: number; denied: number } {
  return { ...entitlementMetrics };
}

export function resetEntitlementMetrics(): void {
  entitlementMetrics.allowed = 0;
  entitlementMetrics.denied = 0;
}

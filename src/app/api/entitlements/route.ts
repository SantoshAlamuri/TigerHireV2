import {
  getAuthContext,
  requireAuth,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { ENTITLEMENT_FEATURE_KEYS, type EntitlementFeatureKey } from "@/lib/entitlements/config";
import { getOrganisationEntitlements } from "@/lib/entitlements";
import { getEntitlementCustomerCatalogEntry } from "@/lib/entitlements/customer-features-catalog";

const ENTITLEMENTS_RESPONSE_TTL_MS = 15_000;
const entitlementsResponseCache = new Map<
  string,
  {
    at: number;
    value: {
      organisationId: string | null | undefined;
      features: Record<EntitlementFeatureKey, boolean>;
    };
  }
>();

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    const cacheKey = ctx.organisationId ?? `user:${ctx.userId}`;
    const cached = entitlementsResponseCache.get(cacheKey);
    if (cached && Date.now() - cached.at < ENTITLEMENTS_RESPONSE_TTL_MS) {
      return jsonSuccess(cached.value);
    }

    const decisions = await getOrganisationEntitlements(
      ctx.organisationId,
      ENTITLEMENT_FEATURE_KEYS,
    );
    const features = ENTITLEMENT_FEATURE_KEYS.reduce(
      (acc, key) => {
        acc[key] = decisions[key].allowed;
        return acc;
      },
      {} as Record<EntitlementFeatureKey, boolean>,
    );
    const catalog = ENTITLEMENT_FEATURE_KEYS.reduce(
      (acc, key) => {
        acc[key] = getEntitlementCustomerCatalogEntry(key);
        return acc;
      },
      {} as Record<EntitlementFeatureKey, ReturnType<typeof getEntitlementCustomerCatalogEntry>>,
    );
    const value = { organisationId: ctx.organisationId, features, catalog };
    entitlementsResponseCache.set(cacheKey, { at: Date.now(), value });
    return jsonSuccess(value);
  } catch (err) {
    return handleApiError(err, "Failed to resolve entitlements", {
      route: "GET /api/entitlements",
    });
  }
}

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIsEnabled = vi.fn();
const mockCacheGet = vi.fn();
const mockCacheSet = vi.fn();
const mockCacheDel = vi.fn();
const mockLoggerInfo = vi.fn();

vi.mock("@/lib/feature-flags", () => ({
  isEnabled: (...args: unknown[]) => mockIsEnabled(...args),
}));

vi.mock("@/lib/redis/cache", () => ({
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
  cacheDel: (...args: unknown[]) => mockCacheDel(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: {
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

function makeQueryResult(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

describe("entitlement resolver", () => {
  beforeEach(async () => {
    mockIsEnabled.mockReset();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockCacheDel.mockReset();
    mockFrom.mockReset();
    mockLoggerInfo.mockReset();
    const m = await import("@/lib/entitlements");
    m.clearEntitlementMemoryCache();
    m.resetEntitlementMetrics();
  });

  it("denies when global kill switch is off", async () => {
    mockIsEnabled.mockResolvedValue(false);
    const { getOrganisationEntitlement } = await import("@/lib/entitlements");
    const decision = await getOrganisationEntitlement("org-1", "offers");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("Global kill switch");
  });

  it("allows when org is not provided", async () => {
    mockIsEnabled.mockResolvedValue(true);
    const { getOrganisationEntitlement } = await import("@/lib/entitlements");
    const decision = await getOrganisationEntitlement(null, "offers");
    expect(decision.allowed).toBe(true);
    expect(decision.source).toBe("no_org");
  });

  it("uses plan default when no override exists", async () => {
    mockIsEnabled.mockResolvedValue(true);
    mockCacheGet.mockResolvedValue(null);
    mockFrom.mockImplementation((table: string) => {
      if (table === "organisations") {
        return makeQueryResult({ id: "org-1", company_plan: "starter" });
      }
      if (table === "billing_plans") {
        return makeQueryResult({ limits: { features: { offers: false } } });
      }
      if (table === "organisation_feature_overrides") {
        return makeQueryResult(null);
      }
      return makeQueryResult(null);
    });
    const { getOrganisationEntitlement } = await import("@/lib/entitlements");
    const decision = await getOrganisationEntitlement("org-1", "offers");
    expect(decision.allowed).toBe(false);
    expect(decision.source).toBe("plan_default");
    expect(mockCacheSet).toHaveBeenCalled();
  });

  it("applies org override over plan default", async () => {
    mockIsEnabled.mockResolvedValue(true);
    mockCacheGet.mockResolvedValue(null);
    mockFrom.mockImplementation((table: string) => {
      if (table === "organisations") {
        return makeQueryResult({ id: "org-1", company_plan: "starter" });
      }
      if (table === "billing_plans") {
        return makeQueryResult({ limits: { features: { offers: false } } });
      }
      if (table === "organisation_feature_overrides") {
        return makeQueryResult({ enabled: true });
      }
      return makeQueryResult(null);
    });
    const { getOrganisationEntitlement } = await import("@/lib/entitlements");
    const decision = await getOrganisationEntitlement("org-1", "offers");
    expect(decision.allowed).toBe(true);
    expect(decision.source).toBe("org_override");
  });
});

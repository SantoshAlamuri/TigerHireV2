import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockQueryBuilder } from "../helpers";

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(),
}));

describe("feature-flags", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns global default when no org override exists", async () => {
    const featureFlagBuilder = createMockQueryBuilder({ data: { enabled: true } });
    const overrideBuilder = createMockQueryBuilder({ data: null });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "feature_flags") return featureFlagBuilder;
        if (table === "organisation_runtime_feature_flag_overrides") return overrideBuilder;
        return createMockQueryBuilder();
      }),
    };

    const { createSupabaseAdmin } = await import("@/lib/supabase/admin");
    (createSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { isEnabled, clearFlagCache } = await import("@/lib/feature-flags");
    clearFlagCache();

    const result = await isEnabled("enable_referrals");
    expect(result).toBe(true);
    expect(featureFlagBuilder.eq).toHaveBeenCalledWith("key", "enable_referrals");
  });

  it("uses organisation override when provided", async () => {
    const featureFlagBuilder = createMockQueryBuilder({ data: { enabled: false } });
    const overrideBuilder = createMockQueryBuilder({ data: { enabled: true } });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "feature_flags") return featureFlagBuilder;
        if (table === "organisation_runtime_feature_flag_overrides") return overrideBuilder;
        return createMockQueryBuilder();
      }),
    };

    const { createSupabaseAdmin } = await import("@/lib/supabase/admin");
    (createSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { isEnabled, clearFlagCache } = await import("@/lib/feature-flags");
    clearFlagCache();

    const result = await isEnabled("ghostbuster_authenticity_agent", "org-123");
    expect(result).toBe(true);
    expect(overrideBuilder.eq).toHaveBeenCalledWith("organisation_id", "org-123");
    expect(overrideBuilder.eq).toHaveBeenCalledWith("flag_key", "ghostbuster_authenticity_agent");
  });

  it("merges global defaults and org overrides in getEnabledFlags", async () => {
    const featureFlagsBuilder = createMockQueryBuilder({
      data: [
        { key: "scout_agent", enabled: false },
        { key: "verify_agent", enabled: true },
      ],
    });
    const overridesBuilder = createMockQueryBuilder({
      data: [{ flag_key: "scout_agent", enabled: true }],
    });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "feature_flags") return featureFlagsBuilder;
        if (table === "organisation_runtime_feature_flag_overrides") return overridesBuilder;
        return createMockQueryBuilder();
      }),
    };

    const { createSupabaseAdmin } = await import("@/lib/supabase/admin");
    (createSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { clearFlagCache, getEnabledFlags } = await import("@/lib/feature-flags");
    clearFlagCache();
    const result = await getEnabledFlags(["scout_agent", "verify_agent", "missing_flag"], "org-1");

    expect(result.scout_agent).toBe(true);
    expect(result.verify_agent).toBe(true);
    expect(result.missing_flag).toBe(false);
  });

  it("defaults to disabled when global flag row is missing", async () => {
    const featureFlagBuilder = createMockQueryBuilder({ data: null });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "feature_flags") return featureFlagBuilder;
        return createMockQueryBuilder();
      }),
    };
    const { createSupabaseAdmin } = await import("@/lib/supabase/admin");
    (createSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { isEnabled, clearFlagCache } = await import("@/lib/feature-flags");
    clearFlagCache();

    const result = await isEnabled("missing_global_row_flag");
    expect(result).toBe(false);
  });

  it("fails closed (returns false) and logs warning on exception", async () => {
    const { createSupabaseAdmin } = await import("@/lib/supabase/admin");
    (createSupabaseAdmin as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("connection refused");
    });

    const { isEnabled, clearFlagCache } = await import("@/lib/feature-flags");
    const { logger } = await import("@/lib/observability/logger");
    clearFlagCache();

    const result = await isEnabled("error_flag");

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      "Feature flag lookup failed, failing closed (disabled)",
      expect.objectContaining({ message: "error_flag" }),
    );
  });
});

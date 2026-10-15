import { describe, expect, it } from "vitest";
import { mergeCatalogOntoFlagRow, sortFlagRowsForAdmin } from "@/lib/feature-flags/catalog";

describe("feature-flag catalog", () => {
  it("merges known keys with display name and billing metadata", () => {
    const row = mergeCatalogOntoFlagRow({
      key: "fitscore_hybrid_v2",
      enabled: true,
      description: "DB note",
      updated_at: null,
    });
    expect(row.displayName).toBe("TigerHire Scoring — core (master switch)");
    expect(row.catalog.customerBilling).toBe("usage_meter_ready");
    expect(row.catalog.meterKey).toBe("fitscore_hybrid_run");
    expect(row.descriptionForAdmin).toContain("TigerHire scoring engine");
    expect(row.descriptionForAdmin).toContain("DB note");
  });

  it("falls back for unknown keys without throwing", () => {
    const row = mergeCatalogOntoFlagRow({
      key: "totally_unknown_flag_xyz",
      enabled: false,
      description: null,
      updated_at: null,
    });
    expect(row.displayName).toBe("Totally Unknown Flag Xyz");
    expect(row.catalog.customerBilling).toBe("none");
    expect(row.catalog.shortDescription).toBeNull();
  });

  it("sorts compliance before legacy_seed", () => {
    const rows = sortFlagRowsForAdmin([
      mergeCatalogOntoFlagRow({
        key: "ai_summaries",
        enabled: true,
        description: null,
        updated_at: null,
      }),
      mergeCatalogOntoFlagRow({
        key: "consent_flow",
        enabled: true,
        description: null,
        updated_at: null,
      }),
    ]);
    expect(rows[0].key).toBe("consent_flow");
    expect(rows[1].key).toBe("ai_summaries");
  });
});

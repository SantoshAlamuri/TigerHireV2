import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockQueryBuilder, createMockSupabase } from "../helpers";
import { checkCompensationBand } from "@/lib/offers/compensation-band-check";
import { compareCtcToBand } from "@/lib/offers/compensation-band-math";
import { getOrganisationEntitlement } from "@/lib/entitlements";

vi.mock("@/lib/entitlements", () => ({
  getOrganisationEntitlement: vi.fn(),
}));

const bandRow = {
  id: "b1",
  organisation_id: "org-1",
  label: "IC3",
  currency: "INR",
  min_amount: 1_000_000,
  max_amount: 1_500_000,
  is_active: true,
};

describe("compareCtcToBand", () => {
  it("1.2M in 1M–1.5M is within", () => {
    const r = compareCtcToBand(1_200_000, bandRow);
    expect(r.within).toBe(true);
    expect(r.deviation).toBe(0);
  });

  it("1.8M is outside with ~20% deviation above max", () => {
    const r = compareCtcToBand(1_800_000, bandRow);
    expect(r.within).toBe(false);
    expect(r.deviation).toBeCloseTo(20, 5);
  });
});

describe("checkCompensationBand", () => {
  beforeEach(() => {
    vi.mocked(getOrganisationEntitlement).mockResolvedValue({
      allowed: true,
      reason: "test",
      source: "plan_default",
      featureKey: "compensation_bands",
      organisationId: "org-1",
    });
  });

  it("returns bands_disabled when entitlement off", async () => {
    vi.mocked(getOrganisationEntitlement).mockResolvedValue({
      allowed: false,
      reason: "off",
      source: "plan_default",
      featureKey: "compensation_bands",
      organisationId: "org-1",
    });
    const admin = createMockSupabase();
    const r = await checkCompensationBand(admin, {
      organisationId: "org-1",
      bandId: "b1",
      compensationJson: { ctc: 1_200_000 },
    });
    expect(r.result).toBe("bands_disabled");
  });

  it("no bandId → no_band", async () => {
    const admin = createMockSupabase();
    const r = await checkCompensationBand(admin, {
      organisationId: "org-1",
      compensationJson: { ctc: 1_200_000 },
    });
    expect(r.result).toBe("no_band");
  });

  it("{ salary: 1.2M } without ctc + band selected → band_check_error (fail closed)", async () => {
    const admin = createMockSupabase({
      compensation_bands: createMockQueryBuilder({ data: bandRow }),
    });
    const r = await checkCompensationBand(admin, {
      organisationId: "org-1",
      bandId: "b1",
      compensationJson: { salary: 1_200_000 },
    });
    // A band is selected but the CTC can't be parsed — we must NOT silently pass
    // as no_band; the guardrail fails closed.
    expect(r.result).toBe("band_check_error");
  });

  it("null compensationJson + band selected → band_check_error, no throw", async () => {
    const admin = createMockSupabase({
      compensation_bands: createMockQueryBuilder({ data: bandRow }),
    });
    const r = await checkCompensationBand(admin, {
      organisationId: "org-1",
      bandId: "b1",
      compensationJson: null,
    });
    expect(r.result).toBe("band_check_error");
  });

  it("1.2M with band → within_band", async () => {
    const admin = createMockSupabase({
      compensation_bands: createMockQueryBuilder({ data: bandRow }),
    });
    const r = await checkCompensationBand(admin, {
      organisationId: "org-1",
      bandId: "b1",
      compensationJson: { ctc: 1_200_000 },
    });
    expect(r.result).toBe("within_band");
    expect(r.offeredAmount).toBe(1_200_000);
  });

  it("accepts ctc as numeric string from JSON", async () => {
    const admin = createMockSupabase({
      compensation_bands: createMockQueryBuilder({ data: bandRow }),
    });
    const r = await checkCompensationBand(admin, {
      organisationId: "org-1",
      bandId: "b1",
      compensationJson: { ctc: "1200000" },
    });
    expect(r.result).toBe("within_band");
    expect(r.offeredAmount).toBe(1_200_000);
  });

  it("1.8M with band → outside_band", async () => {
    const admin = createMockSupabase({
      compensation_bands: createMockQueryBuilder({ data: bandRow }),
    });
    const r = await checkCompensationBand(admin, {
      organisationId: "org-1",
      bandId: "b1",
      compensationJson: { ctc: 1_800_000 },
    });
    expect(r.result).toBe("outside_band");
    expect(r.deviation).toBeCloseTo(20, 5);
  });
});

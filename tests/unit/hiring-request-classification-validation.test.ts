import { describe, expect, it } from "vitest";
import { createMockSupabase, createMockQueryBuilder } from "../helpers";
import { validateHiringRequestClassificationAgainstBands } from "@/lib/hiring-requests/classification-validation";

describe("validateHiringRequestClassificationAgainstBands", () => {
  it("passes when no active bands configured", async () => {
    const supabase = createMockSupabase({
      compensation_bands: createMockQueryBuilder({ data: [] }),
    });
    const result = await validateHiringRequestClassificationAgainstBands(supabase as never, {
      organisationId: "org-1",
      roleLevel: null,
      budgetCtcMin: 1000000,
      budgetCtcMax: 1200000,
    });
    expect(result.ok).toBe(true);
  });

  it("passes when role level missing (progressive disclosure)", async () => {
    const supabase = createMockSupabase({
      compensation_bands: createMockQueryBuilder({
        data: [{ label: "L4", min_amount: 1000000, max_amount: 1500000, is_active: true }],
      }),
    });
    const result = await validateHiringRequestClassificationAgainstBands(supabase as never, {
      organisationId: "org-1",
      roleLevel: null,
      budgetCtcMin: 1000000,
      budgetCtcMax: 1200000,
    });
    expect(result.ok).toBe(true);
  });

  it("fails when budget exceeds selected band", async () => {
    const supabase = createMockSupabase({
      compensation_bands: createMockQueryBuilder({
        data: [{ label: "L4", min_amount: 1000000, max_amount: 1500000, is_active: true }],
      }),
    });
    const result = await validateHiringRequestClassificationAgainstBands(supabase as never, {
      organisationId: "org-1",
      roleLevel: "L4",
      budgetCtcMin: 1100000,
      budgetCtcMax: 1800000,
    });
    expect(result.ok).toBe(false);
  });
});

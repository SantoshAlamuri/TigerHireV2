import { describe, it, expect } from "vitest";
import {
  computeAnnualCtcFromComponents,
  computeAnnualCtcFromLineItems,
  formatCtcLpaInr,
  resolveConfiguredCtcItems,
} from "@/lib/offers/offer-ctc-calculator";

describe("offer-ctc-calculator", () => {
  it("sums multiple components then variable on subtotal", () => {
    const out = computeAnnualCtcFromLineItems({
      items: [
        { label: "Base", annual: 1_000_000 },
        { label: "Allowances", annual: 500_000 },
      ],
      variablePercentOfSubtotal: 10,
      joiningBonus: 0,
      includeJoiningInAnnual: true,
    });
    expect(out.componentSubtotal).toBe(1_500_000);
    expect(out.variableAmount).toBe(150_000);
    expect(out.ctc).toBe(1_650_000);
  });

  it("computes fixed + variable and optional joining", () => {
    const a = computeAnnualCtcFromComponents({
      fixedAnnual: 1_000_000,
      variablePercentOfFixed: 10,
      joiningBonus: 200_000,
      includeJoiningInAnnual: false,
    });
    expect(a.ctc).toBe(1_100_000);
    const b = computeAnnualCtcFromComponents({
      fixedAnnual: 1_000_000,
      variablePercentOfFixed: 10,
      joiningBonus: 200_000,
      includeJoiningInAnnual: true,
    });
    expect(b.ctc).toBe(1_300_000);
  });

  it("formats LPA for INR annual", () => {
    expect(formatCtcLpaInr(2_400_000)).toContain("24.00 LPA");
  });

  it("resolves formula components from base and subtotal", () => {
    const resolved = resolveConfiguredCtcItems([
      { label: "Base / fixed pay", annual: 1_000_000 },
      { label: "HRA", formula: { basis: "base", percent: 40 } },
      { label: "Special allowance", annual: 300_000 },
      { label: "Retention allowance", formula: { basis: "subtotal", percent: 10 } },
    ]);

    expect(resolved.baseAnnual).toBe(1_000_000);
    expect(resolved.manualSubtotal).toBe(1_300_000);
    expect(resolved.resolvedItems).toEqual([
      { label: "Base / fixed pay", annual: 1_000_000 },
      { label: "HRA", annual: 400_000 },
      { label: "Special allowance", annual: 300_000 },
      { label: "Retention allowance", annual: 130_000 },
    ]);
  });
});

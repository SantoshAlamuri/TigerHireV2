import { describe, expect, it } from "vitest";
import {
  normalizeCompensationForStorage,
  parseOfferCtcValue,
  resolveCompensationBreakdownForTemplate,
} from "@/lib/offers/compensation-normalize";
import { buildOfferTemplateVariables } from "@/lib/offers/offer-pdf-template";

describe("parseOfferCtcValue", () => {
  it("parses strings with commas", () => {
    expect(parseOfferCtcValue("2,400,000")).toBe(2_400_000);
  });
});

describe("normalizeCompensationForStorage", () => {
  it("coerces ctc and fills breakdown from components when missing", () => {
    const out = normalizeCompensationForStorage({
      ctc: "2640000",
      components: [
        { label: "Base", annual: 2_000_000 },
        { label: "Allowances", annual: 400_000 },
      ],
      variable_percent_of_components: 10,
      joining_bonus: 0,
      include_joining_in_ctc: true,
    });
    expect(out.ctc).toBe(2_640_000);
    expect(typeof out.breakdown).toBe("string");
    expect(String(out.breakdown)).toContain("Base:");
    expect(String(out.breakdown)).toContain("Variable (10%");
  });
});

describe("resolveCompensationBreakdownForTemplate", () => {
  it("prefers explicit breakdown over components", () => {
    expect(
      resolveCompensationBreakdownForTemplate({
        breakdown: "Custom line",
        components: [{ label: "X", annual: 1 }],
      }),
    ).toBe("Custom line");
  });
});

describe("buildOfferTemplateVariables + structured comp", () => {
  it("fills compensation_breakdown from components when breakdown absent", () => {
    const vars = buildOfferTemplateVariables({
      companyName: "Acme",
      candidateName: "Sam",
      roleTitle: "Eng",
      startDate: "2026-07-01",
      compensation: {
        ctc: 1_650_000,
        components: [
          { label: "Base", annual: 1_000_000 },
          { label: "Allowances", annual: 500_000 },
        ],
        variable_percent_of_components: 10,
        joining_bonus: 0,
        include_joining_in_ctc: true,
      },
      notes: null,
    });
    expect(vars.compensation_breakdown).toContain("Subtotal (components)");
    expect(vars.ctc_lpa).toContain("LPA");
  });
});

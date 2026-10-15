import { describe, expect, it } from "vitest";
import {
  shortenWhyVerdictForCustomer,
  whyVerdictIsRedundantWithGaps,
} from "@/components/dashboard/FitScoreReasoningPanel";

describe("shortenWhyVerdictForCustomer", () => {
  it("keeps model body only and drops deterministic lead + gap sentence", () => {
    const lead =
      "FitScore 61 (Good Fit); verdict: Hire. Top dimensions: a; b. Market rank: x. Ideal profile match 72%. Key ideal-profile gaps: gap one; gap two.";
    const body = "Second sentence for recruiters.\nThird sentence.";
    const result = shortenWhyVerdictForCustomer(`${lead}\n\n${body}`);
    expect(result).toBe(body);
    expect(result).not.toContain("Key ideal-profile gaps:");
    expect(result).not.toMatch(/^FitScore\s+\d+/);
  });

  it("returns null when only deterministic rich lead with no model body", () => {
    const lead =
      "FitScore 61 (Good Fit); verdict: Hire. Top dimensions: a. Market data still building. Ideal profile match 50%. No major ideal-profile gaps called out.";
    expect(shortenWhyVerdictForCustomer(lead)).toBeNull();
  });

  it("returns null when rich lead only lists ideal-profile gaps", () => {
    const lead =
      "FitScore 44 (Weak Fit); verdict: Decline. Top dimensions: a. Market rank: x. Ideal profile match 30%. Key ideal-profile gaps: No Looker; No Spark.";
    expect(shortenWhyVerdictForCustomer(lead)).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(shortenWhyVerdictForCustomer("   ")).toBeNull();
  });

  it("strips basic lead and keeps following paragraphs only", () => {
    const t =
      "Score 55 (Moderate Fit), driven by: skills (7/10); exp (6/10).\n\nProbe deeper on X.";
    expect(shortenWhyVerdictForCustomer(t)).toBe("Probe deeper on X.");
  });

  it("passes through legacy text without deterministic prefix", () => {
    const t = "Some older explanation without FitScore prefix.";
    expect(shortenWhyVerdictForCustomer(t)).toBe(t);
  });
});

describe("whyVerdictIsRedundantWithGaps", () => {
  it("detects gap-list verdict copy that matches red-flag bullets", () => {
    const gaps = [
      "No explicit mention of Looker or Power BI; BI tool coverage skews toward Tableau",
      "Predictive analysis mentioned briefly but no detailed modeling methodology described",
    ];
    const why =
      "Key ideal-profile gaps: No explicit Looker or Power BI; BI tool coverage skews toward Tableau; Predictive analysis mentioned briefly but no detailed modeling methodology described.";
    expect(whyVerdictIsRedundantWithGaps(why, gaps)).toBe(true);
  });

  it("keeps distinct recruiter narrative", () => {
    const gaps = ["No Looker experience"];
    const why =
      "Strong analytics ownership, but the role needs hands-on product-company tenure — probe the Life360 engagement scope in interview.";
    expect(whyVerdictIsRedundantWithGaps(why, gaps)).toBe(false);
  });
});

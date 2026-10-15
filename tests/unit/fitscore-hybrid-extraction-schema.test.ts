import { describe, expect, it } from "vitest";
import { candidateExtractionSchema } from "@/lib/validations/fitscore-hybrid";

const baseExtraction = {
  candidate_name: "Asha",
  total_years: 6,
  dimension_scores: { technical_depth: 8 },
  certifications: ["AWS SA"],
  quantified_impact: ["Improved throughput by 30%"],
  red_flags: [],
  green_flags: ["Strong ownership"],
  role_match_tag: "Backend Engineer",
  summary: "Strong backend candidate",
};

function parseWith(overrides: Record<string, unknown>) {
  const result = candidateExtractionSchema.safeParse({ ...baseExtraction, ...overrides });
  expect(result.success).toBe(true);
  if (!result.success) throw new Error("unreachable");
  return result.data;
}

describe("candidateExtractionSchema red_flags tolerance", () => {
  it("coerces bare string red flags with severity moderate", () => {
    const data = parseWith({
      red_flags: ["Job hopping across 4 roles in 3 years", "No cloud exposure"],
    });
    expect(data.red_flags).toEqual([
      { flag: "Job hopping across 4 roles in 3 years", severity: "moderate" },
      { flag: "No cloud exposure", severity: "moderate" },
    ]);
  });

  it("drops only the garbage element from a mixed red_flags array", () => {
    const data = parseWith({
      red_flags: [
        { flag: "5 employers in 4 years", severity: "critical" },
        42,
        { flag: "No production ownership", severity: "minor" },
      ],
    });
    expect(data.red_flags).toEqual([
      { flag: "5 employers in 4 years", severity: "critical" },
      { flag: "No production ownership", severity: "minor" },
    ]);
  });

  it("coerces objects with alternate text fields (issue/text/description)", () => {
    const data = parseWith({
      red_flags: [
        { issue: "Unexplained 2-year gap", severity: "critical" },
        { text: "Frequent short stints" },
        { description: "Overlapping employment dates", severity: "minor" },
      ],
    });
    expect(data.red_flags).toEqual([
      { flag: "Unexplained 2-year gap", severity: "critical" },
      { flag: "Frequent short stints", severity: "moderate" },
      { flag: "Overlapping employment dates", severity: "minor" },
    ]);
  });

  it("returns [] when red_flags is not an array", () => {
    const data = parseWith({ red_flags: "not an array" });
    expect(data.red_flags).toEqual([]);
  });

  it("normalizes severity case and maps unknown/missing severities to moderate", () => {
    const data = parseWith({
      red_flags: [
        { flag: "A", severity: "Critical" },
        { flag: "B", severity: "SEVERE" },
        { flag: "C" },
        { flag: "D", severity: "  MINOR  " },
      ],
    });
    expect(data.red_flags.map((r) => r.severity)).toEqual([
      "critical",
      "moderate",
      "moderate",
      "minor",
    ]);
  });

  it("does not wipe critical red flags when a sibling element is malformed", () => {
    const data = parseWith({
      red_flags: [{ flag: "Fabricated employment dates", severity: "critical" }, null, {}],
    });
    expect(data.red_flags).toEqual([{ flag: "Fabricated employment dates", severity: "critical" }]);
  });
});

describe("candidateExtractionSchema string-array tolerance", () => {
  it("keeps string green_flags and coerces objects with text fields in a mixed array", () => {
    const data = parseWith({
      green_flags: [
        "Strong ownership",
        { text: "Led team of 6" },
        7,
        { description: "Open-source contributor" },
        null,
      ],
    });
    expect(data.green_flags).toEqual([
      "Strong ownership",
      "Led team of 6",
      "Open-source contributor",
    ]);
  });

  it("returns [] for non-array green_flags / certifications / quantified_impact", () => {
    const data = parseWith({
      green_flags: "nope",
      certifications: { name: "AWS" },
      quantified_impact: 12,
    });
    expect(data.green_flags).toEqual([]);
    expect(data.certifications).toEqual([]);
    expect(data.quantified_impact).toEqual([]);
  });

  it("drops unusable elements from certifications and quantified_impact without wiping the rest", () => {
    const data = parseWith({
      certifications: ["AWS SA", { flag: "ISTQB" }, 3],
      quantified_impact: [{ text: "Cut latency 40%" }, "", "Saved $2M annually"],
    });
    expect(data.certifications).toEqual(["AWS SA", "ISTQB"]);
    expect(data.quantified_impact).toEqual(["Cut latency 40%", "Saved $2M annually"]);
  });
});

import { describe, expect, it } from "vitest";
import { computeHybridConfidence } from "@/lib/fitscore/hybrid/confidence";
import type { CandidateExtraction } from "@/lib/fitscore/hybrid/types";

function makeExtraction(overrides: Partial<CandidateExtraction> = {}): CandidateExtraction {
  return {
    candidate_name: "Test Candidate",
    total_years: 5,
    dimension_scores: { technical_depth: 7, execution: 6 },
    certifications: [],
    quantified_impact: [],
    red_flags: [],
    green_flags: [],
    role_match_tag: "Engineer",
    summary: "Summary",
    ...overrides,
  };
}

describe("computeHybridConfidence", () => {
  it("returns low confidence for thin evidence", () => {
    const extraction = makeExtraction({
      red_flags: [{ flag: "missing outcomes", severity: "moderate" }],
    });
    const result = computeHybridConfidence(extraction, {
      resumeText: "Short resume text",
      extractionUsedVisionFallback: false,
      resumeTruncated: false,
    });
    expect(result.score).toBeGreaterThanOrEqual(0.1);
    expect(result.score).toBeLessThan(0.4);
    expect(result.band).toBe("low");
  });

  it("returns high confidence for rich evidence", () => {
    const extraction = makeExtraction({
      certifications: ["AWS SA", "CKA", "GCP PCA"],
      quantified_impact: ["Cut latency by 45%", "Handled 2M req/day"],
      green_flags: ["Led migration", "Mentored team", "Owned reliability"],
    });
    const richResume = Array.from({ length: 1200 }, (_, i) => `word${i}`).join(" ");
    const result = computeHybridConfidence(extraction, {
      resumeText: richResume,
      extractionUsedVisionFallback: false,
      resumeTruncated: false,
    });
    expect(result.score).toBeGreaterThanOrEqual(0.7);
    expect(result.band).toBe("high");
  });

  it("increases score when application hireability bonus is provided", () => {
    const extraction = makeExtraction({
      green_flags: ["Solid backend"],
      quantified_impact: ["Shipped API v2"],
    });
    const resume = "word ".repeat(400);
    const base = computeHybridConfidence(extraction, {
      resumeText: resume,
      extractionUsedVisionFallback: false,
      resumeTruncated: false,
    });
    const boosted = computeHybridConfidence(extraction, {
      resumeText: resume,
      extractionUsedVisionFallback: false,
      resumeTruncated: false,
      applicationCompletenessBonus: 0.12,
    });
    expect(boosted.score).toBeGreaterThan(base.score);
    expect(boosted.band).not.toBe("low");
  });

  it("applies vision and truncation penalties", () => {
    const extraction = makeExtraction({
      certifications: ["AWS SA"],
      quantified_impact: ["Reduced incidents by 20%"],
      green_flags: ["Clear ownership"],
    });
    const base = computeHybridConfidence(extraction, {
      resumeText: "word ".repeat(900),
      extractionUsedVisionFallback: false,
      resumeTruncated: false,
    });
    const penalized = computeHybridConfidence(extraction, {
      resumeText: "word ".repeat(900),
      extractionUsedVisionFallback: true,
      resumeTruncated: true,
    });
    expect(penalized.score).toBeLessThan(base.score);
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  buildDeterministicFallbackScore,
  extractYearsFromResume,
} from "@/lib/fitscore/hybrid/deterministic-fallback";
import type { JDBaseDocument } from "@/lib/fitscore/hybrid/types";

vi.mock("@/lib/fitscore/scoring-observability", () => ({
  recordFitScoreObservabilityEvent: vi.fn(),
}));

const jdBase: JDBaseDocument = {
  id: "jd-1",
  jobId: "job-1",
  roleTitle: "QA Engineer",
  company: "Acme",
  context: "Bangalore hybrid QA role requiring selenium and api testing",
  weights: { test_automation: 30, api_testing: 25, test_strategy: 20, communication: 25 },
  scoreFloor: 15,
  fitThresholds: { strong: 78, good: 60, moderate: 40, weak: 25 },
  approvedBy: "hm-1",
};

describe("deterministic fallback", () => {
  it("extracts years from resume text", () => {
    expect(extractYearsFromResume("8 years of experience in QA")).toBe(8);
    expect(extractYearsFromResume("no experience line")).toBe(0);
  });

  it("produces a scored extraction without LLM", () => {
    const resume = `
      QA Engineer with 6 years of experience in selenium, api testing, and test strategy.
      Bachelor of Engineering. Based in Bangalore.
    `;
    const result = buildDeterministicFallbackScore({
      jdBase,
      resumeText: resume,
      candidateName: "Test User",
      jobId: "job-1",
      candidateId: "cand-1",
    });
    expect(result.extraction.total_years).toBe(6);
    expect(result.extraction.dimension_scores.test_automation).toBeGreaterThan(0);
    expect(result.signalsUsed.some((s) => s.startsWith("skill_match:"))).toBe(true);
    expect(result.verdictWhyBody).toContain("Basic assessment");
  });
});

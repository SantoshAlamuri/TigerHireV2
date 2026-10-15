import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { FitScore } from "@/types";
import { FitScoreReasoningPanel } from "@/components/dashboard/FitScoreReasoningPanel";

function baseScore(overrides: Partial<FitScore> = {}): FitScore {
  return {
    id: "score-123456",
    candidateId: "cand-1",
    candidateName: "Alex Kumar",
    jobId: "job-1",
    jobTitle: "Engineer",
    companyName: "Acme",
    overallScore: 62,
    rating: "Good",
    dimensions: {},
    greenFlags: [],
    amberFlags: [],
    redFlags: [],
    aiSummary: "",
    modelVersion: "v2",
    promptVersion: "v2",
    scoredAt: new Date().toISOString(),
    ...overrides,
  } as FitScore;
}

describe("FitScoreReasoningPanel – gap display cap priority", () => {
  it("keeps a long critical red flag visible even with 14 terse ideal gaps", () => {
    const criticalRedFlag =
      "Critical: resume claims employment at two different companies simultaneously for 18 months — possible fabrication that must be verified before any offer";
    const idealGaps = Array.from({ length: 14 }, (_, i) => `Missing tool ${i + 1}`);
    render(
      <FitScoreReasoningPanel
        score={baseScore({
          redFlags: [criticalRedFlag],
          idealGaps,
          keyGaps: [],
        })}
      />,
    );
    // Red flags are merged first, so the cap (14) must never drop them for ideal gaps
    expect(screen.getByText(criticalRedFlag)).toBeTruthy();
  });
});

describe("FitScoreReasoningPanel – strengths fallback", () => {
  it("does not render 'No strengths listed' when strengths exist but keywords/quotes are empty", () => {
    const strengths = [
      "Led migration of monolith to microservices across three teams",
      "Owned production reliability for a 2M-user platform",
    ];
    render(
      <FitScoreReasoningPanel
        score={baseScore({
          keyStrengths: strengths,
          greenFlags: strengths,
          matchedKeywords: [],
          verdictEvidenceQuotes: null,
        })}
      />,
    );
    expect(screen.queryByText("No strengths listed")).toBeNull();
    // Strengths appear in the green-flags list (and may also appear as evidence chips)
    expect(screen.getAllByText(strengths[0]).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(strengths[1]).length).toBeGreaterThanOrEqual(1);
  });
});

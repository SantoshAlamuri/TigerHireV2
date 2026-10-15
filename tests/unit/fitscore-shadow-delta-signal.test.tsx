import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import FitScoreCard from "@/components/dashboard/FitScoreCard";
import type { FitScore } from "@/types";

function makeScore(overrides: Partial<FitScore> = {}): FitScore {
  return {
    id: "fs-1",
    candidateId: "cand-1",
    candidateName: "Candidate One",
    candidateNameMasked: "Candidate O.",
    jobPostingId: "job-1",
    jobTitle: "Backend Engineer",
    companyName: "Acme",
    overallScore: 70,
    rating: "Good Match",
    dimensions: {},
    greenFlags: [],
    amberFlags: [],
    redFlags: [],
    aiSummary: "summary",
    modelVersion: "test",
    promptVersion: "v1",
    scoredAt: new Date().toISOString(),
    scoringVersion: 2,
    ...overrides,
  };
}

describe("FitScoreCard shadow delta signal", () => {
  it("shows upward signal when delta >= 8", () => {
    render(
      <FitScoreCard score={makeScore({ primaryScore: 70, shadowScore: 79, scoringVersion: 2 })} />,
    );
    expect(screen.getByText("Undervalued — strong context fit, weak CV presentation")).toBeTruthy();
  });

  it("shows downward signal when delta <= -8", () => {
    render(
      <FitScoreCard score={makeScore({ primaryScore: 80, shadowScore: 70, scoringVersion: 2 })} />,
    );
    expect(
      screen.getByText("Overvalued — weaker market and ideal fit than score suggests"),
    ).toBeTruthy();
  });

  it("shows nothing when delta is between -8 and +8", () => {
    render(
      <FitScoreCard score={makeScore({ primaryScore: 72, shadowScore: 76, scoringVersion: 2 })} />,
    );
    expect(
      screen.queryByText("Undervalued — strong context fit, weak resume presentation"),
    ).toBeNull();
    expect(
      screen.queryByText("Overvalued — weaker market and ideal fit than score suggests"),
    ).toBeNull();
  });

  it("shows nothing when shadowScore is null", () => {
    render(<FitScoreCard score={makeScore({ primaryScore: 72, shadowScore: null as never })} />);
    expect(
      screen.queryByText("Undervalued — strong context fit, weak resume presentation"),
    ).toBeNull();
    expect(
      screen.queryByText("Overvalued — weaker market and ideal fit than score suggests"),
    ).toBeNull();
  });

  it("shows nothing for three-stage score with no shadow", () => {
    render(<FitScoreCard score={makeScore({ scoringVersion: 1, shadowScore: null as never })} />);
    expect(
      screen.queryByText("Undervalued — strong context fit, weak resume presentation"),
    ).toBeNull();
    expect(
      screen.queryByText("Overvalued — weaker market and ideal fit than score suggests"),
    ).toBeNull();
  });
});

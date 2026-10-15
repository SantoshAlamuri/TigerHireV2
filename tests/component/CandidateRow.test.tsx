import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import CandidateRow from "@/components/dashboard/CandidateRow";
import type { Candidate } from "@/types";

function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: "c-1",
    name: "John Doe",
    nameMasked: "J*** D***",
    claimed: true,
    roleTitle: "Software Engineer",
    roleFunction: "Engineering",
    seniorityLevel: "Mid",
    currentCompany: "Acme Corp",
    locationCity: "Mumbai",
    locationState: "Maharashtra",
    remotePreference: "hybrid",
    skillsVerified: ["React", "TypeScript"],
    skillsInferred: ["Node.js"],
    intentScore: 75,
    intentLabel: "Active Now",
    signalFreshnessDate: new Date().toISOString(),
    salaryMinInferred: 1500000,
    salaryMaxInferred: 2500000,
    yearsExperience: 5,
    profileCompleteness: 80,
    ...overrides,
  } as Candidate;
}

describe("CandidateRow", () => {
  it("renders candidate name and fit score", () => {
    render(<CandidateRow candidate={makeCandidate()} fitScore={85} />);
    expect(
      screen.getByText((content, node) => {
        const text = node?.textContent ?? content;
        return text.replace(/\s+/g, " ").trim() === "John Doe";
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("85")).toBeInTheDocument();
  });

  it("shows location when provided", () => {
    render(<CandidateRow candidate={makeCandidate({ locationCity: "Bangalore" })} />);
    expect(screen.getByText("Bangalore")).toBeInTheDocument();
  });

  it("shows intent badge", () => {
    render(<CandidateRow candidate={makeCandidate({ intentScore: 90 })} />);
    expect(screen.getByText("90 intent")).toBeInTheDocument();
  });

  it("handles missing optional fields gracefully", () => {
    render(<CandidateRow candidate={makeCandidate({ locationCity: "", currentCompany: "" })} />);
    expect(
      screen.getByText((content, node) => {
        const text = node?.textContent ?? content;
        return text.replace(/\s+/g, " ").trim() === "John Doe";
      }),
    ).toBeInTheDocument();
  });

  it("shows masked name when not claimed", () => {
    render(<CandidateRow candidate={makeCandidate({ claimed: false, nameMasked: "J*** D***" })} />);
    expect(
      screen.getByText((content, node) => {
        const text = node?.textContent ?? content;
        return text.replace(/\s+/g, " ").trim() === "J*** D***";
      }),
    ).toBeInTheDocument();
  });
});

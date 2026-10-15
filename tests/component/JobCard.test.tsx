import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import JobCard from "@/components/dashboard/JobCard";
import type { JobPosting } from "@/types";

function makeJob(overrides: Partial<JobPosting> = {}): JobPosting {
  return {
    id: "job-1",
    companyId: "comp-1",
    companyName: "TechCorp",
    titleRaw: "Senior Frontend Developer",
    titleNormalised: "Senior Frontend Developer",
    roleFunction: "Engineering",
    seniorityLevel: "Senior",
    location: "Mumbai",
    remoteAllowed: true,
    skillsRequired: ["React", "TypeScript", "CSS"],
    skillsPreferred: ["Next.js"],
    salaryMin: 2000000,
    salaryMax: 3500000,
    jdTextRaw: "Job description text",
    urgencyScore: 70,
    postedDate: new Date().toISOString(),
    lastSeenDate: new Date().toISOString(),
    isActive: true,
    matchedCandidatesCount: 12,
    ...overrides,
  } as JobPosting;
}

describe("JobCard", () => {
  it("renders job title", () => {
    render(<JobCard job={makeJob()} />);
    expect(screen.getByRole("heading", { name: "Senior Frontend Developer" })).toBeInTheDocument();
  });

  it("renders location", () => {
    render(<JobCard job={makeJob({ location: "Bangalore" })} />);
    expect(screen.getByText(/Bangalore/)).toBeInTheDocument();
  });

  it("renders skills as tags", () => {
    render(<JobCard job={makeJob()} />);
    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("CSS")).toBeInTheDocument();
  });

  it("shows salary range when provided", () => {
    render(<JobCard job={makeJob({ salaryMin: 2000000, salaryMax: 3500000 })} />);
    expect(screen.getByText(/₹20–35L\/yr/)).toBeInTheDocument();
  });

  it("shows matched candidates count", () => {
    render(<JobCard job={makeJob({ matchedCandidatesCount: 8 })} />);
    expect(screen.getByText("8 matched")).toBeInTheDocument();
  });
});

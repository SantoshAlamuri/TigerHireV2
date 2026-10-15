import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import {
  PipelineCard,
  type PipelineCandidate,
} from "@/app/(dashboard)/recruit/pipeline/components/RecruitPipelineCard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/recruit/pipeline",
}));

vi.mock("@/lib/api/fetch-pipeline-stages", () => ({
  fetchPipelineStages: () => Promise.resolve([]),
}));

function baseCandidate(): PipelineCandidate {
  return {
    id: "pc-1",
    job_id: "job-1",
    candidate_id: "cand-1",
    stage_id: null,
    status: "shortlisted",
    interview_scheduled_at: null,
    interview_outcome: null,
    recruiter_rating: null,
    created_at: new Date().toISOString(),
    candidates: {
      id: "cand-1",
      name: "Jane Candidate",
      email: "jane@example.com",
      phone: "9999999999",
      skills: ["React"],
      location: "Bengaluru",
      experience_years: 5,
      current_role: "Frontend Engineer",
    },
    jobTitle: "Frontend Engineer",
    jobCompensationMin: null,
    jobCompensationMax: null,
    jobRoleFunction: "Engineering",
    stageName: "Shortlisted",
    approvals: [],
    overallScore: 82,
    keyStrengths: ["Strong React projects"],
    keyGaps: ["Limited backend depth"],
    confidence: "high",
    band: "strong",
    criteriaBreakdown: [
      {
        criterion_name: "Skills Match",
        grade: "A",
        weight: 30,
        points_earned: 28,
        evidence_text: "Built production React apps",
      },
    ],
    matchedKeywords: ["react", "nextjs"],
    provenanceHash: "abc123hash",
    greenFlags: ["Owns features end-to-end"],
    redFlags: [],
  };
}

describe("Recruit PipelineCard reasoning modal", () => {
  it("opens reasoning modal and shows provenance", () => {
    render(
      <PipelineCard
        pc={baseCandidate()}
        onStatusChange={vi.fn()}
        updating={null}
        outcomeLogging={null}
        outcomeLogged={null}
        interviewRequesting={null}
        interviewSuccess={null}
      />,
    );

    fireEvent.click(screen.getByText("View score reasoning"));
    expect(screen.getByText("FitScore Reasoning")).toBeInTheDocument();
    expect(screen.getByText(/abc123hash/i)).toBeInTheDocument();
    expect(screen.getByText(/Criteria Breakdown/i)).toBeInTheDocument();
  });
});

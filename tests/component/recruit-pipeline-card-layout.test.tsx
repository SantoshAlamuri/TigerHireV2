import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import {
  PipelineCard,
  buildPipelineScoreColumns,
  type PipelineCandidate,
} from "@/app/(dashboard)/recruit/pipeline/components/RecruitPipelineCard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/recruit/pipeline",
}));

vi.mock("@/lib/api/fetch-pipeline-stages", () => ({
  fetchPipelineStages: () => Promise.resolve([]),
}));

function baseCandidate(overrides: Partial<PipelineCandidate> = {}): PipelineCandidate {
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
      email: "seed.qa.30@seed-qa.tigerhire.demo",
      phone: "9999999999",
      skills: ["React"],
      location: "Bengaluru",
      experience_years: 5,
      current_role: "Frontend Engineer",
    },
    jobTitle: "QA Engineer",
    jobCompensationMin: null,
    jobCompensationMax: null,
    jobRoleFunction: "Engineering",
    stageName: "Shortlisted",
    approvals: [],
    overallScore: 63,
    marketScore: null,
    idealMatch: null,
    ...overrides,
  };
}

describe("buildPipelineScoreColumns", () => {
  it("returns only populated score columns", () => {
    expect(buildPipelineScoreColumns(baseCandidate()).map((c) => c.id)).toEqual(["fit"]);
    expect(
      buildPipelineScoreColumns(baseCandidate({ marketScore: 40, idealMatch: 55 })).map(
        (c) => c.id,
      ),
    ).toEqual(["fit", "market", "ideal"]);
  });
});

describe("Recruit PipelineCard layout", () => {
  it("renders FIT-only scores without Market/Ideal columns", () => {
    render(<PipelineCard pc={baseCandidate()} onStatusChange={vi.fn()} updating={null} />);

    expect(screen.getByText("Fit")).toBeInTheDocument();
    expect(screen.getByText("63")).toBeInTheDocument();
    expect(screen.queryByText("Market")).not.toBeInTheDocument();
    expect(screen.queryByText("Ideal")).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(screen.queryByText("--")).not.toBeInTheDocument();
  });

  it("renders all three score columns when values exist", () => {
    render(
      <PipelineCard
        pc={baseCandidate({ marketScore: 72, idealMatch: 58 })}
        onStatusChange={vi.fn()}
        updating={null}
      />,
    );

    expect(screen.getByText("Fit")).toBeInTheDocument();
    expect(screen.getByText("Market")).toBeInTheDocument();
    expect(screen.getByText("Ideal")).toBeInTheDocument();
    expect(screen.getByText("72")).toBeInTheDocument();
    expect(screen.getByText("58")).toBeInTheDocument();
  });

  it("exposes full email via title tooltip and does not show inline Select label", () => {
    const email = "seed.qa.30@seed-qa.tigerhire.demo";
    render(<PipelineCard pc={baseCandidate()} onStatusChange={vi.fn()} updating={null} />);

    const emailEl = screen.getByTestId("pipeline-card-email");
    expect(emailEl).toHaveAttribute("title", email);
    expect(emailEl).toHaveTextContent(email);
    expect(screen.queryByLabelText(/select/i)).not.toBeInTheDocument();
  });

  it("shows selection checkbox only in selection mode", () => {
    const { rerender } = render(
      <PipelineCard
        pc={baseCandidate()}
        onStatusChange={vi.fn()}
        updating={null}
        selected={false}
        onToggleSelect={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("pipeline-card-select-checkbox")).not.toBeInTheDocument();

    rerender(
      <PipelineCard
        pc={baseCandidate()}
        onStatusChange={vi.fn()}
        updating={null}
        selected={false}
        selectionMode
        onToggleSelect={vi.fn()}
      />,
    );

    expect(screen.getByTestId("pipeline-card-select-checkbox")).toBeInTheDocument();
    expect(screen.queryByText(/^Select$/)).not.toBeInTheDocument();
  });

  it("shows card menu for active pipeline status (seeded QA candidates)", () => {
    render(
      <PipelineCard
        pc={baseCandidate({ status: "active" })}
        onStatusChange={vi.fn()}
        onMoveStage={vi.fn()}
        updating={null}
      />,
    );

    expect(screen.getByRole("button", { name: /change status/i })).toBeInTheDocument();
  });
});

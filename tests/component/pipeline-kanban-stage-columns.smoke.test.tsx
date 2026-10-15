import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PipelineKanbanBoard } from "@/components/dashboard/PipelineKanbanBoard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/recruit/pipeline",
}));

describe("PipelineKanbanBoard stage columns smoke", () => {
  it("renders stage catalog columns even when no candidates", () => {
    render(
      <PipelineKanbanBoard
        candidates={[]}
        stageCatalog={[
          { id: "s1", stage_name: "Applied", stage_order: 0 },
          { id: "s2", stage_name: "Interview", stage_order: 1 },
          { id: "s3", stage_name: "Offer", stage_order: 2 },
        ]}
        updating={null}
        onStatusChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Applied")).toBeInTheDocument();
    expect(screen.getByText("Interview")).toBeInTheDocument();
    expect(screen.getByText("Offer")).toBeInTheDocument();
    expect(screen.getAllByText("No candidates").length).toBeGreaterThanOrEqual(3);
  });

  it("merges same-named stages across jobs into one column", () => {
    render(
      <PipelineKanbanBoard
        candidates={[
          {
            id: "pc-1",
            job_id: "job-1",
            candidate_id: "cand-1",
            stage_id: "stage-job-1",
            status: "in_progress",
            interview_scheduled_at: null,
            interview_outcome: null,
            recruiter_rating: null,
            created_at: "2026-04-29T00:00:00.000Z",
            candidates: {
              id: "cand-1",
              name: "Alex",
              email: null,
              skills: null,
              location: null,
              experience_years: null,
              current_role: null,
            },
            jobTitle: "Role A",
            jobCompensationMin: null,
            jobCompensationMax: null,
            jobRoleFunction: null,
            stageName: "Interview",
            stageOrder: 1,
            approvals: [],
          },
          {
            id: "pc-2",
            job_id: "job-2",
            candidate_id: "cand-2",
            stage_id: "stage-job-2",
            status: "in_progress",
            interview_scheduled_at: null,
            interview_outcome: null,
            recruiter_rating: null,
            created_at: "2026-04-29T00:00:00.000Z",
            candidates: {
              id: "cand-2",
              name: "Blair",
              email: null,
              skills: null,
              location: null,
              experience_years: null,
              current_role: null,
            },
            jobTitle: "Role B",
            jobCompensationMin: null,
            jobCompensationMax: null,
            jobRoleFunction: null,
            stageName: "Interview",
            stageOrder: 1,
            approvals: [],
          },
        ]}
        stageCatalog={[
          { id: "stage-job-1", stage_name: "Interview", stage_order: 1 },
          { id: "stage-job-2", stage_name: "Interview", stage_order: 1 },
        ]}
        updating={null}
        onStatusChange={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Interview")).toHaveLength(1);
    expect(screen.getByText("Alex")).toBeInTheDocument();
    expect(screen.getByText("Blair")).toBeInTheDocument();
  });
});

import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
const mutate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hooks/use-api", () => ({
  useOptimisticMutation: () => ({ mutate, loading: false, error: null }),
  invalidateQueries: vi.fn(),
}));
vi.mock("@/app/(dashboard)/recruit/jobs/[id]/components/JdBaseSetupStep", () => ({
  JdBaseSetupStep: ({
    guidedStep,
    onRequirementsSaved,
    onGuidedApproved,
  }: {
    guidedStep: number;
    onRequirementsSaved: () => void;
    onGuidedApproved: () => void;
  }) => (
    <div>
      <p>{guidedStep === 1 ? "Requirements form" : "Evaluation form"}</p>
      <button onClick={guidedStep === 1 ? onRequirementsSaved : onGuidedApproved}>
        Save stage
      </button>
    </div>
  ),
}));
vi.mock("@/app/(dashboard)/recruit/jobs/[id]/edit/JobEditor", () => ({
  JobEditor: () => <p>Publication editor</p>,
}));
import { SetupStageWorkspace } from "@/app/(dashboard)/recruit/jobs/[id]/setup/SetupStageWorkspace";
import type { SetupStep } from "@/lib/v2/setup-sequence";
const steps: SetupStep[] = [
  "Request",
  "Job description",
  "Hiring requirements",
  "Candidate evaluation",
  "Preview and publish",
].map((title, index) => ({
  key: String(index),
  title,
  state: index === 0 ? "done" : "todo",
  detail: "Stored request",
  href: "/request",
  optional: false,
}));
beforeEach(() => {
  cleanup();
  mutate.mockReset();
});
it("saves the active description before moving to requirements, then evaluation and publication", async () => {
  mutate.mockResolvedValue({});
  render(
    <SetupStageWorkspace
      jobId="j1"
      steps={steps}
      description={"Description ".repeat(10)}
      scoringEnabled
    />,
  );
  expect(screen.queryByText("Requirements form")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save & continue" }));
  await screen.findByText("Requirements form");
  expect(mutate).toHaveBeenCalledWith({ description: "Description ".repeat(10) });
  fireEvent.click(screen.getByRole("button", { name: "Save stage" }));
  expect(screen.getByText("Evaluation form")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save stage" }));
  expect(screen.getByText("Publication editor")).toBeInTheDocument();
});
it("keeps description and active stage after failed persistence", async () => {
  mutate.mockResolvedValue(null);
  render(
    <SetupStageWorkspace
      jobId="j1"
      steps={steps}
      description={"Description ".repeat(10)}
      scoringEnabled
    />,
  );
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "New description ".repeat(10) },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save & continue" }));
  await waitFor(() => expect(mutate).toHaveBeenCalled());
  expect(screen.getByRole("textbox")).toHaveValue("New description ".repeat(10));
  expect(screen.queryByText("Requirements form")).not.toBeInTheDocument();
});

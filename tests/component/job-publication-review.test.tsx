import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  push: vi.fn(),
  job: {
    status: "draft",
    is_active: true,
    list_on_public_job_board: true,
    title: "Engineer",
    description: "A detailed engineering job description with enough content to be valid.",
    show_salary: false,
  } as Record<string, unknown>,
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "j1" }),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/lib/hooks/use-api", () => ({
  useApiQuery: (path: string) => ({
    data:
      path === "/api/jobs/j1"
        ? { job: mocks.job }
        : path.includes("referral-config")
          ? { config: null }
          : { members: [] },
    loading: false,
    error: null,
  }),
  useOptimisticMutation: () => ({ mutate: mocks.update, loading: false, error: null }),
  invalidateQueries: vi.fn(),
}));
vi.mock("@/lib/mappers", () => ({
  mapDbJobToPosting: (j: Record<string, unknown>) => ({
    titleNormalised: j.title,
    jdTextRaw: j.description,
    location: "Pune",
    salaryMin: 1000000,
    salaryMax: 2000000,
  }),
}));
vi.mock("@/components/dashboard/JobReferralBonusFormFields", () => ({
  JobReferralBonusFormFields: () => null,
  buildReferralConfigPayload: () => ({}),
}));
import RecruitEditJobPage from "@/app/(dashboard)/recruit/jobs/[id]/edit/page";

beforeEach(() => {
  cleanup();
  mocks.update.mockReset();
  mocks.push.mockReset();
  mocks.job.status = "draft";
  mocks.job.is_active = true;
  mocks.job.list_on_public_job_board = true;
});
async function preview() {
  render(<RecruitEditJobPage />);
  await screen.findByRole("button", { name: "Preview & publish" });
  fireEvent.click(screen.getByRole("button", { name: "Preview & publish" }));
}
describe("explicit job publication", () => {
  it("previews unsaved fields and only publishes after confirmation", async () => {
    mocks.update.mockResolvedValue({ job: { ...mocks.job, status: "open" } });
    render(<RecruitEditJobPage />);
    fireEvent.change(await screen.findByLabelText("Job Title"), {
      target: { value: "Staff Engineer" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview & publish" }));
    expect(screen.getByRole("heading", { name: "Staff Engineer" })).toBeInTheDocument();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(screen.getByText("Salary is not shown publicly.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Publish job" }));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Staff Engineer",
          status: "open",
          listOnPublicJobBoard: true,
        }),
      ),
    );
    expect(await screen.findByRole("link", { name: "View public job" })).toHaveAttribute(
      "href",
      "/jobs/j1",
    );
  });
  it("retains the preview and editor input after a failed publish", async () => {
    mocks.update.mockResolvedValue(null);
    await preview();
    fireEvent.click(screen.getByRole("button", { name: "Publish job" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Publication was not saved");
    fireEvent.click(screen.getByRole("button", { name: "Back to editing" }));
    expect(screen.getByLabelText("Job Title")).toHaveValue("Engineer");
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it("names reopening explicitly and never calls it an existing live job", async () => {
    mocks.job.status = "closed";
    await preview();
    expect(screen.getByRole("button", { name: "Reopen and publish job" })).toBeInTheDocument();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not promise a public link when public listing is off", async () => {
    mocks.job.list_on_public_job_board = false;
    await preview();
    expect(screen.getByRole("button", { name: "Open for internal hiring" })).toBeInTheDocument();
    expect(screen.getByText(/without a public application link/)).toBeInTheDocument();
  });
  it("does not claim an inactive job can be published", async () => {
    mocks.job.is_active = false;
    await preview();
    expect(screen.getByRole("button", { name: "Publish job" })).toBeDisabled();
  });
  it("labels editing an open job as an update", async () => {
    mocks.job.status = "open";
    await preview();
    expect(screen.getByRole("button", { name: "Update publication" })).toBeInTheDocument();
  });
});

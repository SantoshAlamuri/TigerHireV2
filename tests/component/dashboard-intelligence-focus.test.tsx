import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

let focusParam: string | null = null;
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({
    get: (key: string) => (key === "focus" ? focusParam : null),
  }),
}));

vi.mock("@/components/dashboard/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dashboard-shell">{children}</div>
  ),
}));

vi.mock("@/components/dashboard/OverrideReasonModal", () => ({
  OverrideReasonModal: () => null,
}));

const mockUseApiQuery = vi.fn();
vi.mock("@/lib/hooks/use-api", () => ({
  useApiQuery: (...args: unknown[]) => mockUseApiQuery(...args),
}));

vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "user-1", role: "recruiter" },
  }),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock("@/app/(dashboard)/recruit/pipeline/components/RecruitPipelineCard", () => ({
  PIPELINE_STATUS_META: {
    shortlisted: { label: "Shortlisted", tone: "neutral" },
    in_progress: { label: "In Progress", tone: "neutral" },
    hired: { label: "Hired", tone: "success" },
    rejected: { label: "Rejected", tone: "danger" },
  },
  STATUS_ORDER: ["shortlisted", "in_progress", "hired", "rejected"],
  STATUS_CONFIG: {
    shortlisted: { label: "Shortlisted", bg: "", color: "" },
    in_progress: { label: "In Progress", bg: "", color: "" },
    hired: { label: "Hired", bg: "", color: "" },
    rejected: { label: "Rejected", bg: "", color: "" },
  },
  PipelineCard: ({ pc }: { pc: { id: string } }) => <div data-testid="pipeline-card">{pc.id}</div>,
}));

describe("Dashboard intelligence focus filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    const now = Date.now();
    const tomorrow = new Date(now + 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString();
    const yesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    mockUseApiQuery.mockReturnValue({
      data: {
        pipeline: [
          {
            id: "pc-needs-feedback",
            status: "shortlisted",
            job_id: "job-1",
            jobTitle: "Role 1",
            candidate_id: "cand-1",
            interview_scheduled_at: yesterday,
            interview_outcome: null,
            overallScore: 75,
            candidates: { name: "A" },
          },
          {
            id: "pc-tomorrow",
            status: "in_progress",
            job_id: "job-1",
            jobTitle: "Role 1",
            candidate_id: "cand-2",
            interview_scheduled_at: tomorrow,
            interview_outcome: null,
            overallScore: 78,
            candidates: { name: "B" },
          },
          {
            id: "pc-irrelevant",
            status: "hired",
            job_id: "job-1",
            jobTitle: "Role 1",
            candidate_id: "cand-3",
            interview_scheduled_at: null,
            interview_outcome: null,
            overallScore: 85,
            candidates: { name: "C" },
          },
        ],
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it("applies needs-feedback focus filter", async () => {
    focusParam = "needs-feedback";
    const mod = await import("@/app/(dashboard)/recruit/pipeline/page");
    const Page = mod.default;
    render(<Page />);
    expect(screen.getByText(/^Focus$/i)).toBeInTheDocument();
    expect(screen.getAllByTestId("pipeline-card")).toHaveLength(1);
    expect(screen.getByText("pc-needs-feedback")).toBeInTheDocument();
  });

  it("applies tomorrow-plan focus filter", async () => {
    focusParam = "tomorrow-plan";
    const mod = await import("@/app/(dashboard)/recruit/pipeline/page");
    const Page = mod.default;
    render(<Page />);
    expect(screen.getAllByTestId("pipeline-card")).toHaveLength(1);
    expect(screen.getByText("pc-tomorrow")).toBeInTheDocument();
  });
});

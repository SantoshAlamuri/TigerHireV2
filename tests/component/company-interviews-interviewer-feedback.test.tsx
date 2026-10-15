import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import CompanyInterviewsPage from "@/app/(dashboard)/company/interviews/page";
import ToastProvider from "@/components/ui/Toast";

const mockUseAuth = vi.fn();
const mockInterviewerQuery = vi.fn();

vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/lib/hooks/use-api", () => ({
  useApiQuery: (url: string | null) => {
    if (url === "/api/interviewer/interviews") {
      return mockInterviewerQuery();
    }
    return {
      data: { templates: [{ id: "tpl-1", name: "Interview form" }] },
      loading: false,
      error: null,
    };
  },
}));

vi.mock("@/app/(dashboard)/recruit/jobs/[id]/components/FeedbackSubmitButton", () => ({
  FeedbackSubmitButton: () => <button type="button">Submit feedback</button>,
}));

describe("Company interviews interviewer queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: { role: "interviewer", id: "user-1" },
    });
    mockInterviewerQuery.mockReturnValue({
      data: {
        interviews: [
          {
            pipelineCandidateId: "pc-1",
            jobId: "job-1",
            candidateName: "Alex Candidate",
            candidateEmail: "alex@example.com",
            jobTitle: "Backend Engineer",
            stageName: "Technical",
            scheduledAt: "2026-05-20T10:00:00.000Z",
            feedbackSubmitted: false,
          },
        ],
      },
      loading: false,
      refetch: vi.fn(),
    });
  });

  it("shows submit feedback on interviewer queue rows", () => {
    render(
      <ToastProvider>
        <CompanyInterviewsPage />
      </ToastProvider>,
    );
    expect(screen.getByRole("button", { name: "Submit feedback" })).toBeInTheDocument();
  });
});

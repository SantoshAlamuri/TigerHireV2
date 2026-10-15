import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import CompanyOverviewPage from "@/app/(dashboard)/company/page";

const query = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hooks/use-api", () => ({ useApiQuery: query }));
vi.mock("@/app/(dashboard)/company/DomainVerification", () => ({ DomainVerification: () => null }));
const overview = {
  activeJobs: 4,
  pendingApplications: 7,
  pendingFeedbackCount: 3,
  overdueFeedbackCount: 2,
  tomorrowInterviewsCount: 1,
  upcomingInterviews: [],
  pendingFeedbackPreview: [],
  fitScoreUniqueCandidateCount: 12,
  fitScorePairCount: 20,
  fitScoreAvgOverall: 0,
};

beforeEach(() => {
  query.mockReset();
  query.mockImplementation((url, params) => ({
    data:
      url === "/api/approvals"
        ? { items: [{ id: "approval" }] }
        : url === "/api/analytics" && params?.metric === "overview"
          ? { overview }
          : url
            ? { activity: [] }
            : null,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }));
});

describe("leadership daily workspace", () => {
  it("starts with actions and defers reports without requesting a full jobs list", () => {
    render(<CompanyOverviewPage />);
    expect(screen.getByRole("link", { name: /Request a role/ })).toHaveAttribute(
      "href",
      "/company/hiring-requests/new",
    );
    expect(screen.getByRole("link", { name: /Complete feedback/ })).toHaveTextContent("3");
    expect(screen.getByRole("link", { name: /Complete feedback/ })).toHaveTextContent("2 overdue");
    expect(
      query.mock.calls.some(
        ([url, params]) => url === "/api/analytics" && params?.metric === "activity",
      ),
    ).toBe(false);
    expect(query.mock.calls.some(([url]) => url === "/api/jobs")).toBe(false);
    expect(screen.queryByText(/Delivery health|SLA risk/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reports" }));
    expect(
      query.mock.calls.some(
        ([url, params]) => url === "/api/analytics" && params?.metric === "activity",
      ),
    ).toBe(true);
    expect(screen.getByText("Average fit score").parentElement).toHaveTextContent("0");
    expect(screen.getByRole("link", { name: "View hiring portfolio" })).toBeInTheDocument();
  });
  it("keeps failed overview requests distinct from an empty hiring pipeline", () => {
    query.mockReturnValue({ data: null, loading: false, error: "Unavailable", refetch: vi.fn() });
    render(<CompanyOverviewPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load hiring overview");
    expect(screen.queryByText("No interviews scheduled.")).not.toBeInTheDocument();
    expect(screen.queryByText("No approvals waiting")).not.toBeInTheDocument();
  });
});

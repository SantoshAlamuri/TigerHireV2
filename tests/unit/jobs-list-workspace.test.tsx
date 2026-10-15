import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RecruitJobsPage from "@/app/(dashboard)/recruit/jobs/page";
import { JobsListWorkspace } from "@/app/(dashboard)/recruit/jobs/JobsListWorkspace";
const state = vi.hoisted(() => ({
  role: "recruiter",
  query: "",
  data: {} as unknown,
  loading: false,
  error: null as string | null,
  push: vi.fn(),
  refetch: vi.fn(),
  queryHook: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push }),
  useSearchParams: () => new URLSearchParams(state.query),
}));
vi.mock("@/lib/auth/AuthProvider", () => ({ useAuth: () => ({ user: { role: state.role } }) }));
vi.mock("@/lib/hooks/use-api", () => ({
  useApiQuery: (...args: unknown[]) => {
    state.queryHook(...args);
    return { data: state.data, loading: state.loading, error: state.error, refetch: state.refetch };
  },
}));
vi.mock("@/app/(dashboard)/recruit/jobs/SeatHome", () => ({
  HiringManagerHome: () => <div>Manager home</div>,
  AgencyHome: () => <div>Agency home</div>,
}));
beforeEach(() => {
  state.role = "recruiter";
  state.query = "";
  state.loading = false;
  state.error = null;
  state.data = { jobs: [], pagination: { total: 0, totalPages: 0 } };
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("shared jobs list", () => {
  it("loads one bounded summary query and exposes every draft with truthful publication", () => {
    state.data = {
      jobs: [
        ...Array.from({ length: 6 }, (_, i) => ({
          id: `draft-${i}`,
          title: `Draft ${i}`,
          status: "draft",
          applications: [{ count: 0 }],
        })),
        {
          id: "open",
          title: "Open role",
          status: "open",
          is_active: false,
          list_on_public_job_board: true,
          applications: [{ count: 1501 }],
        },
      ],
      pagination: { total: 7, totalPages: 1 },
    };
    render(<JobsListWorkspace />);
    expect(state.queryHook).toHaveBeenCalledWith(
      "/api/jobs",
      expect.objectContaining({ view: "summary", limit: 20, page: 1 }),
    );
    expect(state.queryHook.mock.calls.every(([url]) => url === "/api/jobs")).toBe(true);
    expect(screen.getByRole("link", { name: /Draft 5/ }).getAttribute("href")).toBe(
      "/recruit/jobs/draft-5",
    );
    expect(screen.getByText("1501 candidates")).toBeTruthy();
    expect(screen.getByText("Open · not publicly listed")).toBeTruthy();
    expect(screen.queryByText("Published")).toBeNull();
  });

  it("preserves context on company filters, search and pagination", () => {
    state.role = "leadership";
    state.query = "source=queue&status=closed&page=2&search=Engineer";
    state.data = {
      jobs: [{ id: "job-1", title: "Engineer", status: "closed", applications: [{ count: 3 }] }],
      pagination: { total: 45, totalPages: 3 },
    };
    render(<JobsListWorkspace basePath="/company/jobs" />);
    expect(screen.getByRole("link", { name: /Engineer/ }).getAttribute("href")).toBe(
      "/company/jobs/job-1",
    );
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(state.push).toHaveBeenLastCalledWith(
      "/company/jobs?source=queue&status=closed&page=3&search=Engineer",
      { scroll: false },
    );
    fireEvent.click(screen.getByRole("button", { name: "Drafts" }));
    expect(state.push).toHaveBeenLastCalledWith(
      "/company/jobs?source=queue&status=draft&search=Engineer",
      { scroll: false },
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Search jobs" }), {
      target: { value: "Designer" },
    });
    fireEvent.submit(screen.getByRole("search"));
    expect(state.push).toHaveBeenLastCalledWith(
      "/company/jobs?source=queue&status=closed&search=Designer",
      { scroll: false },
    );
  });

  it("offers a retry instead of presenting a failed request as empty", () => {
    state.error = "Unavailable";
    render(<JobsListWorkspace />);
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(state.refetch).toHaveBeenCalledOnce();
    expect(screen.queryByText("No jobs yet")).toBeNull();
  });

  it("does not fetch recruiter data before rendering a manager seat", () => {
    state.role = "hiring_manager";
    render(<RecruitJobsPage />);
    expect(screen.getByText("Manager home")).toBeTruthy();
    expect(state.queryHook).not.toHaveBeenCalled();
  });
});

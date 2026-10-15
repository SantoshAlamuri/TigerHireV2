import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockListTasks = vi.fn();

vi.mock("@/lib/tasks/list-actionable-tasks-for-user", () => ({
  listActionableTasksForUser: (...args: unknown[]) => mockListTasks(...args),
}));

const recruiterCtx = {
  userId: "u1",
  role: "recruiter" as const,
  organisationId: "org-1",
};

const mockGetAuthContext = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => !!ctx,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  jsonError: (msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), { status }),
  jsonSuccess: (data: unknown) => new Response(JSON.stringify(data), { status: 200 }),
  handleApiError: () => new Response(JSON.stringify({ error: "err" }), { status: 500 }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({})),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => ({})),
}));

vi.mock("@/lib/job-access", () => ({
  assertJobAccess: vi.fn(async () => ({
    job: { id: "job-1", organisation_id: "org-1", hiring_manager_id: null },
  })),
}));

describe("GET /api/jobs/[id]/plan/pending", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("FF_PLAN_DOCUMENT", "true");
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockListTasks.mockResolvedValue({
      tasks: [
        {
          id: "shortlist:pc1",
          kind: "approval_shortlist",
          category: "approvals",
          phase: 2,
          title: "Shortlist approval — Alice",
          job_id: "job-1",
          href: "/tasks?task=shortlist%3Apc1",
          assignee_id: "u1",
          action: "approve",
          created_at: "2026-05-10T08:00:00.000Z",
          urgency: "normal",
          completable: true,
        },
      ],
      meta: {
        total: 1,
        by_kind: {},
        by_category: { approvals: 1 },
        by_action_shape: { decide: 1 },
        flags_active: true,
      },
    });
  });

  it("returns actionable tasks with meta", async () => {
    const { GET } = await import("@/app/api/jobs/[id]/plan/pending/route");
    const res = await GET(new NextRequest("http://localhost"), {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meta.total).toBe(1);
    expect(body.tasks[0].kind).toBe("approval_shortlist");
    expect(mockListTasks).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ userId: "u1" }),
      expect.objectContaining({ jobId: "job-1" }),
    );
  });
});

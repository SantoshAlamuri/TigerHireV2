import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockEnsure = vi.fn();
const mockGetPlan = vi.fn();
const mockListStages = vi.fn();
const mockUpdatePlan = vi.fn();
const mockAppendHistory = vi.fn();
const mockLinkStages = vi.fn();

vi.mock("@/lib/recruitment-plan", () => ({
  ensureRecruitmentPlanForJob: (...args: unknown[]) => mockEnsure(...args),
  getRecruitmentPlanByJobId: (...args: unknown[]) => mockGetPlan(...args),
  listPlanStages: (...args: unknown[]) => mockListStages(...args),
  updateRecruitmentPlan: (...args: unknown[]) => mockUpdatePlan(...args),
  appendPlanHistory: (...args: unknown[]) => mockAppendHistory(...args),
  linkPlanStagesToPipeline: (...args: unknown[]) => mockLinkStages(...args),
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
  parseJsonBody: async (request: Request) => {
    try {
      const body = await request.json();
      return { body, errorResponse: null };
    } catch {
      return {
        body: null,
        errorResponse: new Response(JSON.stringify({ error: "Invalid JSON body" }), {
          status: 400,
        }),
      };
    }
  },
  jsonError: (msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), { status }),
  jsonSuccess: (data: unknown) => new Response(JSON.stringify(data), { status: 200 }),
  handleZodError: () =>
    new Response(JSON.stringify({ error: "Invalid request payload" }), { status: 422 }),
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ from: mockFrom })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock("@/lib/job-access", () => ({
  assertJobAccess: vi.fn(async () => ({
    job: { id: "job-1", organisation_id: "org-1", hiring_manager_id: null },
  })),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

describe("GET /api/jobs/[id]/recruitment-plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockLinkStages.mockImplementation(async (_admin, _jobId, _planId, stages) => ({
      stages,
      linked: 0,
    }));
  });

  it("returns existing plan and stages", async () => {
    mockGetPlan.mockResolvedValue({
      plan: { id: "plan-1", job_id: "job-1", status: "active" },
      error: null,
    });
    mockListStages.mockResolvedValue({
      stages: [{ id: "s1", display_name: "Application", stage_order: 0 }],
      error: null,
    });

    const { GET } = await import("@/app/api/jobs/[id]/recruitment-plan/route");
    const res = await GET(new NextRequest("http://localhost"), {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan.id).toBe("plan-1");
    expect(body.stages).toHaveLength(1);
    expect(body.created).toBe(false);
  });

  it("ensures plan when missing", async () => {
    mockGetPlan.mockResolvedValueOnce({ plan: null, error: null });
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { status: "open" }, error: null }),
        }),
      }),
    });
    mockEnsure.mockResolvedValue({
      plan: { id: "plan-new", job_id: "job-1" },
      stages: [],
      created: true,
      error: null,
    });

    const { GET } = await import("@/app/api/jobs/[id]/recruitment-plan/route");
    const res = await GET(new NextRequest("http://localhost"), {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(true);
    expect(mockEnsure).toHaveBeenCalled();
  });
});

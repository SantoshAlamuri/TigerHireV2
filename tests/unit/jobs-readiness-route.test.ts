import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockFetchJobReadiness = vi.fn();
const mockIsPlanDocumentNavActive = vi.fn();

vi.mock("@/lib/jobs/job-readiness-server", () => ({
  fetchJobReadiness: (...args: unknown[]) => mockFetchJobReadiness(...args),
}));

vi.mock("@/lib/navigation/plan-document-nav-filter", () => ({
  isPlanDocumentNavActive: () => mockIsPlanDocumentNavActive(),
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
  handleApiError: (err: unknown) =>
    new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}));

vi.mock("@/lib/job-access", () => ({
  assertJobAccess: vi.fn().mockResolvedValue({
    job: { id: "job-1", organisation_id: "org-1" },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn().mockReturnValue({}),
}));

describe("GET /api/jobs/[id]/readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockIsPlanDocumentNavActive.mockReturnValue(true);
    mockFetchJobReadiness.mockResolvedValue({
      hybrid_v2_enabled: true,
      requisition: {
        status: "not_linked",
        req_code: null,
        reviewer_name: null,
        hiring_request_id: null,
        on_hold_reason: null,
        raw_status: null,
      },
      jd: { status: "published", char_count: 500 },
      jd_base: {
        status: "approved",
        approved_by_name: "HM",
        approved_at: "2026-05-01",
        jd_base_id: "jb-1",
      },
      scoring: {
        hybrid_v2_count: 1,
        legacy_count: 0,
        total: 1,
        pending_scoring_count: 0,
        status: "all_v2",
      },
    });
  });

  it("returns 404 when plan document flag is off", async () => {
    mockIsPlanDocumentNavActive.mockReturnValue(false);
    const { GET } = await import("@/app/api/jobs/[id]/readiness/route");
    const res = await GET(new NextRequest("http://localhost/api/jobs/j1/readiness"), {
      params: Promise.resolve({ id: "j1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns readiness payload when authorized", async () => {
    const { GET } = await import("@/app/api/jobs/[id]/readiness/route");
    const res = await GET(new NextRequest("http://localhost/api/jobs/job-1/readiness"), {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scoring.status).toBe("all_v2");
    expect(mockFetchJobReadiness).toHaveBeenCalledWith(expect.anything(), "job-1", "org-1");
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/jobs/[id]/readiness/route");
    const res = await GET(new NextRequest("http://localhost/api/jobs/j1/readiness"), {
      params: Promise.resolve({ id: "j1" }),
    });
    expect(res.status).toBe(401);
  });
});

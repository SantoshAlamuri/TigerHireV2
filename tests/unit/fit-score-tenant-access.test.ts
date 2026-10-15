import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { recruiterCtx, fakeUuid } from "../helpers";

const JOB_ID = fakeUuid("000000000001");
const CANDIDATE_ID = fakeUuid("000000000002");

const mockGetAuthContext = vi.fn();
const mockAssertJobAccess = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  parseJsonBody: async (request: Request) => ({
    body: await request.json(),
    errorResponse: null,
  }),
  jsonError: (msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  jsonSuccess: (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }),
  handleZodError: () => new Response(JSON.stringify({ error: "validation" }), { status: 422 }),
  handleApiError: () => new Response(JSON.stringify({ error: "fail" }), { status: 500 }),
}));

vi.mock("@/lib/security/csrf", () => ({ validateOrigin: () => null }));
vi.mock("@/lib/security/rate-limit", () => ({
  buildScopedRateLimitKey: () => "k",
  checkRateLimit: async () => ({ allowed: true }),
}));
vi.mock("@/lib/entitlements", () => ({
  requireOrganisationEntitlement: async () => ({ ok: true }),
}));
vi.mock("@/lib/feature-flags", () => ({ isEnabled: async () => false }));
vi.mock("@/lib/jobs/queue", () => ({ enqueue: async () => ({ id: "q-1" }) }));
vi.mock("@/lib/fitscore/hybrid", () => ({
  getJdBaseByJobId: async () => ({ approvedBy: "hm-1" }),
}));
vi.mock("@/lib/job-access", () => ({
  assertJobAccess: (...args: unknown[]) => mockAssertJobAccess(...args),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ from: vi.fn() }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ from: vi.fn() }),
}));
vi.mock("@/lib/services/FitScoreService", () => ({
  FitScoreService: {
    computeSingle: vi.fn(),
    computeBatch: vi.fn(),
  },
}));

describe("POST /api/fit-score tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
  });

  it("returns 403 when recruiter cannot access job", async () => {
    mockAssertJobAccess.mockResolvedValue({ job: null });
    const { POST } = await import("@/app/api/fit-score/route");
    const res = await POST(
      new NextRequest("http://localhost/api/fit-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: JOB_ID, candidateId: CANDIDATE_ID }),
      }),
    );
    expect(res.status).toBe(403);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockValidateOrigin = vi.fn();
const mockFrom = vi.fn();
const mockAssertJobAccess = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({}),
}));

vi.mock("@/lib/job-access", () => ({
  assertJobAccess: (...args: unknown[]) => mockAssertJobAccess(...args),
}));

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => Boolean(ctx),
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
          headers: { "Content-Type": "application/json" },
        }),
      };
    }
  },
  jsonError: (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  jsonSuccess: (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: (...args: unknown[]) => mockValidateOrigin(...args),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  buildScopedRateLimitKey: () => "pipeline-bulk:test",
}));

describe("POST /api/pipeline/bulk", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockCheckRateLimit.mockReset();
    mockValidateOrigin.mockReset();
    mockFrom.mockReset();
    mockValidateOrigin.mockReturnValue(null);
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockAssertJobAccess.mockResolvedValue({
      job: { id: "job-1", organisation_id: "org-1", hiring_manager_id: null },
    });
  });

  it("returns 401 for unauthenticated requests", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/pipeline/bulk/route");
    const req = new NextRequest("http://localhost:3000/api/pipeline/bulk", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("applies move action for selected pipeline candidates", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "user-1",
      organisationId: "org-1",
      role: "recruiter",
    });

    const selectBuilder = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({
        data: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            job_id: "job-1",
            candidate_id: "cand-1",
            jobs: { organisation_id: "org-1" },
          },
        ],
        error: null,
      }),
    };
    const updateBuilder = {
      update: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ error: null }),
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === "pipeline_candidates") {
        return {
          select: selectBuilder.select,
          in: selectBuilder.in,
          update: updateBuilder.update,
        };
      }
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    const { POST } = await import("@/app/api/pipeline/bulk/route");
    const req = new NextRequest("http://localhost:3000/api/pipeline/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pipelineCandidateIds: ["00000000-0000-4000-8000-000000000001"],
        action: "move",
        status: "in_progress",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.auditLogged).toBe(true);
  });
});

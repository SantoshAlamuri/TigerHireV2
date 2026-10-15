import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => Boolean(ctx),
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  jsonError: (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), { status }),
  jsonSuccess: (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), { status }),
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), { status: 500 }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

describe("GET /api/compliance/dsr", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockFrom.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/compliance/dsr/route");
    const req = new NextRequest("http://localhost:3000/api/compliance/dsr");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns requests for super admin", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "admin-1",
      organisationId: null,
      role: "super_admin",
    });

    const erasureBuilder = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: [{ id: "req-1" }], count: 1, error: null }),
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === "erasure_requests") return erasureBuilder;
      return null;
    });

    const { GET } = await import("@/app/api/compliance/dsr/route");
    const req = new NextRequest("http://localhost:3000/api/compliance/dsr?limit=10");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
  });

  it("returns organisation-scoped requests for company admin", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "company-1",
      organisationId: "org-1",
      role: "leadership",
    });

    // Org reach comes from the shared resolvers (agency links → unlocks / jobs
    // → fit scores), not from a candidates.organisation_id column: that column
    // does not exist, and the query against it 500'd this route in production.
    const agencyClientsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const unlocksBuilder = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: [{ candidate_id: "cand-1" }], error: null }),
    };
    const jobsBuilder = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const erasureBuilder = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [{ id: "req-2", candidate_id: "cand-1" }],
        count: 1,
        error: null,
      }),
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === "agency_clients") return agencyClientsBuilder;
      if (table === "candidate_unlocks") return unlocksBuilder;
      if (table === "jobs") return jobsBuilder;
      if (table === "erasure_requests") return erasureBuilder;
      return null;
    });

    const { GET } = await import("@/app/api/compliance/dsr/route");
    const req = new NextRequest("http://localhost:3000/api/compliance/dsr?limit=10");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    // The erasure query must be scoped to the resolved candidate ids.
    expect(erasureBuilder.in).toHaveBeenCalledWith("candidate_id", ["cand-1"]);
  });
});

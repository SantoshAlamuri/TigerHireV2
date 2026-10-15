import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();
const mockFrom = vi.fn();
const mockHasOptedIn = vi.fn();

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

vi.mock("@/lib/repositories/SessionRepository", () => ({
  SessionRepository: {
    hasOptedIn: (...args: unknown[]) => mockHasOptedIn(...args),
  },
}));

describe("GET /api/whatsapp/flow-status", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockFrom.mockReset();
    mockHasOptedIn.mockReset();
    mockHasOptedIn.mockResolvedValue(true);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/whatsapp/flow-status/route");
    const req = new NextRequest(
      "http://localhost:3000/api/whatsapp/flow-status?jobId=job-1&candidateId=cand-1",
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns flow payload for recruiter", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "user-1",
      organisationId: "org-1",
      role: "recruiter",
    });

    const jobBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: "job-1", organisation_id: "org-1" } }),
    };
    // applications carries neither the interview fields nor a phone — those live
    // on pipeline_candidates and candidates respectively. The previous fixture
    // asserted the broken shape, which is why the route's failure was invisible.
    const appBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: "app-1", status: "in_progress" },
      }),
    };
    const pipelineBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: "pc-1",
          status: "in_progress",
          interview_scheduled_at: null,
          interview_outcome: null,
        },
      }),
    };
    const candidateBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { phone: "9999999999" } }),
    };
    const offerBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === "jobs") return jobBuilder;
      if (table === "applications") return appBuilder;
      if (table === "offers") return offerBuilder;
      if (table === "pipeline_candidates") return pipelineBuilder;
      if (table === "candidates") return candidateBuilder;
      // There is no `interviews` table; a fixture that answered for one let the
      // route look healthy while querying something that does not exist.
      throw new Error(`unexpected table in flow-status: ${table}`);
    });

    const { GET } = await import("@/app/api/whatsapp/flow-status/route");
    const req = new NextRequest(
      "http://localhost:3000/api/whatsapp/flow-status?jobId=job-1&candidateId=cand-1",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobId).toBe("job-1");
    expect(body.whatsappOptIn).toBe(true);
    expect(Array.isArray(body.timeline)).toBe(true);
    expect(
      body.timeline.some((event: { type: string }) => event.type === "application_received"),
    ).toBe(true);
    // The phone that drives the opt-in lookup comes from candidates, not applications.
    expect(candidateBuilder.select).toHaveBeenCalledWith("phone");
  });
});

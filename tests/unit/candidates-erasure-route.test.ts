import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  candidateCtx,
  recruiterCtx,
  superAdminCtx,
  createMockSupabase,
  createMockQueryBuilder,
} from "../helpers";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
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
    new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  jsonSuccess: (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  handleZodError: (err: { issues: Array<{ message: string }> }) =>
    new Response(
      JSON.stringify({
        error: err.issues.map((e: { message: string }) => e.message).join("; "),
      }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    ),
  handleApiError: (err: unknown, _msg: string) =>
    new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

const mockCreateSupabaseServerClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

const mockCreateSupabaseAdmin = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockCreateSupabaseAdmin(),
}));

vi.mock("@/lib/security/csrf", () => ({ validateOrigin: () => null }));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const mockRequestErasure = vi.fn();
vi.mock("@/lib/services/ConsentService", () => ({
  ConsentService: {
    requestErasure: (...args: unknown[]) => mockRequestErasure(...args),
  },
}));

const mockEraseData = vi.fn();
vi.mock("@/lib/services/CandidateService", () => ({
  CandidateService: {
    eraseData: (...args: unknown[]) => mockEraseData(...args),
  },
}));

const CANDIDATE_ID = "00000000-1111-4000-8000-000000000001";

function makeRequest(body: unknown = {}) {
  return new NextRequest("http://localhost:3000/api/candidates/erasure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/candidates/erasure", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequestErasure.mockResolvedValue({ id: "erasure-req-1" });
    mockEraseData.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/candidates/erasure/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 for recruiter role (non-candidate, non-super_admin)", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);

    const supabase = createMockSupabase();
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const adminClient = createMockSupabase();
    mockCreateSupabaseAdmin.mockReturnValue(adminClient);

    const { POST } = await import("@/app/api/candidates/erasure/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
  });

  it("returns 200 for candidate requesting own erasure", async () => {
    // candidate_free is in the allowed roles
    mockGetAuthContext.mockResolvedValue(candidateCtx);

    const candidateData = { id: CANDIDATE_ID, phone: "+919876543210" };
    const candidatesBuilder = createMockQueryBuilder({ data: candidateData });
    const supabase = createMockSupabase({ candidates: candidatesBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const adminBuilder = createMockQueryBuilder({ data: null, error: null });
    const adminClient = createMockSupabase({ erasure_requests: adminBuilder });
    mockCreateSupabaseAdmin.mockReturnValue(adminClient);

    const { POST } = await import("@/app/api/candidates/erasure/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("Data erasure request processed");
    expect(body.requestId).toBe("erasure-req-1");
    expect(mockEraseData).toHaveBeenCalledWith(expect.anything(), CANDIDATE_ID);
  });

  it("returns 404 when candidate profile not found", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);

    const candidatesBuilder = createMockQueryBuilder({ data: null, error: null });
    const supabase = createMockSupabase({ candidates: candidatesBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const adminClient = createMockSupabase();
    mockCreateSupabaseAdmin.mockReturnValue(adminClient);

    const { POST } = await import("@/app/api/candidates/erasure/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("No candidate profile found");
  });

  it("returns 200 for super_admin erasure with candidateId", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);

    const supabase = createMockSupabase();
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const adminBuilder = createMockQueryBuilder({ data: null, error: null });
    const adminClient = createMockSupabase({ erasure_requests: adminBuilder });
    mockCreateSupabaseAdmin.mockReturnValue(adminClient);

    const { POST } = await import("@/app/api/candidates/erasure/route");
    const res = await POST(makeRequest({ candidateId: CANDIDATE_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requestId).toBe("erasure-req-1");
    expect(mockEraseData).toHaveBeenCalledWith(expect.anything(), CANDIDATE_ID);
  });

  it("does not return success when the completion stamp fails", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    mockCreateSupabaseServerClient.mockResolvedValue(createMockSupabase());
    mockCreateSupabaseAdmin.mockReturnValue(
      createMockSupabase({
        erasure_requests: createMockQueryBuilder({ error: { message: "denied" } }),
      }),
    );
    const { POST } = await import("@/app/api/candidates/erasure/route");
    const res = await POST(makeRequest({ candidateId: CANDIDATE_ID }));
    expect(res.status).toBe(500);
    expect(mockEraseData).toHaveBeenCalled();
  });

  it("does not complete a request after partial erasure", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    mockCreateSupabaseServerClient.mockResolvedValue(createMockSupabase());
    const requests = createMockQueryBuilder();
    mockCreateSupabaseAdmin.mockReturnValue(createMockSupabase({ erasure_requests: requests }));
    mockEraseData.mockRejectedValue(new Error("Candidate CV erasure incomplete; retry required"));
    const { POST } = await import("@/app/api/candidates/erasure/route");
    expect((await POST(makeRequest({ candidateId: CANDIDATE_ID }))).status).toBe(500);
    expect(requests.update).not.toHaveBeenCalled();
  });

  it("returns 500 on service error", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);

    const candidateData = { id: CANDIDATE_ID, phone: "+919876543210" };
    const candidatesBuilder = createMockQueryBuilder({ data: candidateData });
    const supabase = createMockSupabase({ candidates: candidatesBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const adminClient = createMockSupabase();
    mockCreateSupabaseAdmin.mockReturnValue(adminClient);

    mockRequestErasure.mockRejectedValue(new Error("DB connection lost"));

    const { POST } = await import("@/app/api/candidates/erasure/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

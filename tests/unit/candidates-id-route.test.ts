import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  agencyCtx,
  candidateCtx,
  hiringManagerCtx,
  recruiterCtx,
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
          headers: { "Content-Type": "application/json" },
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

const mockAssertCandidateAccessForOrgs = vi.fn();
vi.mock("@/lib/security/tenancy", () => ({
  assertCandidateAccessForOrgs: (...args: unknown[]) => mockAssertCandidateAccessForOrgs(...args),
  ForbiddenError: class ForbiddenError extends Error {
    status = 403;
    constructor(msg: string) {
      super(msg);
      this.name = "ForbiddenError";
    }
  },
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const mockSelfHeal = vi.fn().mockResolvedValue({ queued: false, reason: "already_parsed" });
vi.mock("@/lib/candidates/self-heal-parse", () => ({
  maybeSelfHealCandidateParse: (...a: unknown[]) => mockSelfHeal(...a),
}));

const mockCreateSupabaseServerClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

describe("GET /api/candidates/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const candidateBuilder = createMockQueryBuilder({
      data: { id: "c1", user_id: "u1", name: "Jane" },
    });
    const supabase = createMockSupabase({ candidates: candidateBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/candidates/[id]/route");
    const req = new NextRequest("http://localhost/api/candidates/c1");
    const res = await GET(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when candidate not found", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const candidateBuilder = createMockQueryBuilder({
      data: null,
      error: { message: "not found" },
    });
    const supabase = createMockSupabase({ candidates: candidateBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/candidates/[id]/route");
    const req = new NextRequest("http://localhost/api/candidates/c-missing");
    const res = await GET(req, {
      params: Promise.resolve({ id: "c-missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when candidate views another candidate profile", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const candidateBuilder = createMockQueryBuilder({
      data: {
        id: "c-other",
        user_id: "other-user",
        name: "Other Candidate",
      },
    });
    const supabase = createMockSupabase({ candidates: candidateBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/candidates/[id]/route");
    const req = new NextRequest("http://localhost/api/candidates/c-other");
    const res = await GET(req, { params: Promise.resolve({ id: "c-other" }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 when candidate views own profile", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const candidateBuilder = createMockQueryBuilder({
      data: {
        id: "c1",
        user_id: candidateCtx.userId,
        name: "Jane Doe",
        email: "jane@example.com",
      },
    });
    const unlockBuilder = createMockQueryBuilder({ data: null });
    const supabase = createMockSupabase({
      candidates: candidateBuilder,
      candidate_unlocks: unlockBuilder,
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/candidates/[id]/route");
    const req = new NextRequest("http://localhost/api/candidates/c1");
    const res = await GET(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidate.id).toBe("c1");
    expect(body.candidate.name).toBe("Jane Doe");
  });

  it("returns 403 when recruiter has no access to candidate (assertCandidateAccessForOrgs throws)", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const candidateBuilder = createMockQueryBuilder({
      data: { id: "c1", user_id: "u1", name: "Jane" },
    });
    const unlockBuilder = createMockQueryBuilder({ data: null });
    const supabase = createMockSupabase({
      candidates: candidateBuilder,
      candidate_unlocks: unlockBuilder,
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);
    const { ForbiddenError } = await import("@/lib/security/tenancy");
    mockAssertCandidateAccessForOrgs.mockRejectedValue(new ForbiddenError("no access"));

    const { GET } = await import("@/app/api/candidates/[id]/route");
    const req = new NextRequest("http://localhost/api/candidates/c1");
    const res = await GET(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 when agency has access with full candidate fields (unlock not required for contact)", async () => {
    mockGetAuthContext.mockResolvedValue(agencyCtx);
    const candidateBuilder = createMockQueryBuilder({
      data: {
        id: "c1",
        user_id: "u1",
        name: "Jane Doe",
        email: "jane@example.com",
        phone: "+1234567890",
      },
    });
    const linksBuilder = createMockQueryBuilder({
      data: [{ client_organisation_id: "client-1" }],
    });
    const unlockBuilder = createMockQueryBuilder({ data: null });
    const supabase = createMockSupabase({
      candidates: candidateBuilder,
      agency_clients: linksBuilder,
      candidate_unlocks: unlockBuilder,
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);
    mockAssertCandidateAccessForOrgs.mockResolvedValue(undefined);

    const { GET } = await import("@/app/api/candidates/[id]/route");
    const req = new NextRequest("http://localhost/api/candidates/c1");
    const res = await GET(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidate).toBeDefined();
    expect(body.candidate.email).toBe("jane@example.com");
    expect(body.candidate.phone).toBe("+1234567890");
    expect(body.isUnlocked).toBe(true);
  });

  // A hiring manager is scoped to the jobs they are assigned to — not to every candidate
  // their organisation can reach. GET /api/candidates (list) already enforces this; the
  // detail route must not be the wider door.
  it("returns 403 when hiring manager has no assigned jobs", async () => {
    mockGetAuthContext.mockResolvedValue(hiringManagerCtx);
    const supabase = createMockSupabase({
      candidates: createMockQueryBuilder({ data: { id: "c1", user_id: "u1", name: "Jane" } }),
      jobs: createMockQueryBuilder({ data: [] }),
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/candidates/[id]/route");
    const req = new NextRequest("http://localhost/api/candidates/c1");
    const res = await GET(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 403 when the candidate is in neither the applications nor the pipeline of a job the hiring manager owns", async () => {
    mockGetAuthContext.mockResolvedValue(hiringManagerCtx);
    const supabase = createMockSupabase({
      candidates: createMockQueryBuilder({ data: { id: "c1", user_id: "u1", name: "Jane" } }),
      jobs: createMockQueryBuilder({ data: [{ id: "job-1" }] }),
      applications: createMockQueryBuilder({ data: [] }),
      pipeline_candidates: createMockQueryBuilder({ data: [] }),
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/candidates/[id]/route");
    const req = new NextRequest("http://localhost/api/candidates/c1");
    const res = await GET(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 when the candidate applied to a job the hiring manager owns", async () => {
    mockGetAuthContext.mockResolvedValue(hiringManagerCtx);
    const supabase = createMockSupabase({
      candidates: createMockQueryBuilder({
        data: { id: "c1", user_id: "u1", name: "Jane Doe", email: "jane@example.com" },
      }),
      jobs: createMockQueryBuilder({ data: [{ id: "job-1" }] }),
      applications: createMockQueryBuilder({ data: [{ id: "app-1" }] }),
      pipeline_candidates: createMockQueryBuilder({ data: [] }),
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/candidates/[id]/route");
    const req = new NextRequest("http://localhost/api/candidates/c1");
    const res = await GET(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidate.id).toBe("c1");
  });

  // The agency backfill path inserts pipeline rows with no application behind them; an HM
  // must still be able to open a candidate sitting on their own board.
  it("returns 200 when the candidate is on the hiring manager's pipeline without an application", async () => {
    mockGetAuthContext.mockResolvedValue(hiringManagerCtx);
    const supabase = createMockSupabase({
      candidates: createMockQueryBuilder({ data: { id: "c1", user_id: "u1", name: "Jane Doe" } }),
      jobs: createMockQueryBuilder({ data: [{ id: "job-1" }] }),
      applications: createMockQueryBuilder({ data: [] }),
      pipeline_candidates: createMockQueryBuilder({ data: [{ id: "pc-1" }] }),
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/candidates/[id]/route");
    const req = new NextRequest("http://localhost/api/candidates/c1");
    const res = await GET(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidate.id).toBe("c1");
  });

  it("returns 403 when hiring manager has no organisation", async () => {
    mockGetAuthContext.mockResolvedValue({ ...hiringManagerCtx, organisationId: null });
    const supabase = createMockSupabase({
      candidates: createMockQueryBuilder({ data: { id: "c1", user_id: "u1", name: "Jane" } }),
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/candidates/[id]/route");
    const req = new NextRequest("http://localhost/api/candidates/c1");
    const res = await GET(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/candidates/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/candidates/[id]/route");
    const req = new NextRequest("http://localhost/api/candidates/c1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when candidate not found", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const existingBuilder = createMockQueryBuilder({ data: null });
    const supabase = createMockSupabase({ candidates: existingBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { PATCH } = await import("@/app/api/candidates/[id]/route");
    const req = new NextRequest("http://localhost/api/candidates/c-missing", {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated" }),
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "c-missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when non-owner and non-super_admin tries to update", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const existingBuilder = createMockQueryBuilder({
      data: { id: "c1", user_id: "other-user" },
    });
    const supabase = createMockSupabase({ candidates: existingBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { PATCH } = await import("@/app/api/candidates/[id]/route");
    const req = new NextRequest("http://localhost/api/candidates/c1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Hacked" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 when candidate updates own profile", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const updatedCandidate = {
      id: "c1",
      user_id: candidateCtx.userId,
      name: "Jane Updated",
      email: "jane@example.com",
    };
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi
        .fn()
        .mockResolvedValueOnce({
          data: { id: "c1", user_id: candidateCtx.userId },
          error: null,
        })
        .mockResolvedValueOnce({ data: updatedCandidate, error: null }),
    };
    const supabase = createMockSupabase({});
    supabase.from = vi.fn((table: string) =>
      table === "candidates" ? chain : createMockQueryBuilder(),
    ) as typeof supabase.from;
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { PATCH } = await import("@/app/api/candidates/[id]/route");
    const req = new NextRequest("http://localhost/api/candidates/c1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Jane Updated" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidate.name).toBe("Jane Updated");
  });

  it("returns 422 when body invalid (e.g. invalid email)", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: "c1", user_id: candidateCtx.userId },
        error: null,
      }),
    };
    const supabase = createMockSupabase({});
    supabase.from = vi.fn((table: string) =>
      table === "candidates" ? chain : createMockQueryBuilder(),
    ) as typeof supabase.from;
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { PATCH } = await import("@/app/api/candidates/[id]/route");
    const req = new NextRequest("http://localhost/api/candidates/c1", {
      method: "PATCH",
      body: JSON.stringify({ email: "not-an-email" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(422);
  });

  it("returns 400 when JSON body is malformed", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { PATCH } = await import("@/app/api/candidates/[id]/route");
    const req = new NextRequest("http://localhost/api/candidates/c1", {
      method: "PATCH",
      body: "not json",
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(400);
  });
});

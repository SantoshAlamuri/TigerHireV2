import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  superAdminCtx,
  recruiterCtx,
  candidateCtx,
  companyAdminCtx,
  hiringManagerCtx,
  createMockQueryBuilder,
  fakeUuid,
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
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

const mockListForOrg = vi.fn().mockResolvedValue([]);
const mockListForHiringManager = vi.fn().mockResolvedValue([]);
const mockListForJob = vi.fn().mockResolvedValue([]);
const mockListForCandidate = vi.fn().mockResolvedValue([]);
const mockComputeSingle = vi.fn().mockResolvedValue({ id: "fs-1", overall_score: 85 });
const mockComputeBatch = vi.fn().mockResolvedValue({ computed: 3 });
const mockMarkDeferredScore = vi.fn().mockResolvedValue(undefined);
const mockGetLatestProductionScore = vi.fn().mockResolvedValue(null);
const mockGetJdBaseByJobId = vi.fn();
const mockAssertJobAccess = vi.fn();

vi.mock("@/lib/job-access", () => ({
  assertJobAccess: (...args: unknown[]) => mockAssertJobAccess(...args),
}));

vi.mock("@/lib/services/FitScoreService", () => ({
  FitScoreService: {
    listForOrg: (...args: unknown[]) => mockListForOrg(...args),
    listForHiringManager: (...args: unknown[]) => mockListForHiringManager(...args),
    listForJob: (...args: unknown[]) => mockListForJob(...args),
    listForCandidate: (...args: unknown[]) => mockListForCandidate(...args),
    computeSingle: (...args: unknown[]) => mockComputeSingle(...args),
    computeBatch: (...args: unknown[]) => mockComputeBatch(...args),
    markDeferredScore: (...args: unknown[]) => mockMarkDeferredScore(...args),
    getLatestProductionScore: (...args: unknown[]) => mockGetLatestProductionScore(...args),
  },
}));

vi.mock("@/lib/security/rate-limit", () => ({
  buildScopedRateLimitKey: ({
    route,
    organisationId,
    userId,
  }: {
    route: string;
    organisationId?: string | null;
    userId?: string | null;
  }) => (organisationId && userId ? `${route}:${organisationId}:${userId}` : `${route}:${userId}`),
  checkRateLimit: () => Promise.resolve({ allowed: true, remaining: 10, resetAt: new Date() }),
}));

const mockServerFrom = vi.fn();
const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({ from: (...a: unknown[]) => mockServerFrom(...a) }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (...a: unknown[]) => mockAdminFrom(...a),
  }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/feature-flags", () => ({
  isEnabled: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/entitlements", () => ({
  requireOrganisationEntitlement: vi.fn().mockResolvedValue({ ok: true, message: "" }),
}));

vi.mock("@/lib/jobs/queue", () => ({
  enqueue: vi.fn().mockResolvedValue({ id: "queue-1" }),
}));

vi.mock("@/lib/fitscore/hybrid", () => ({
  getJdBaseByJobId: (...args: unknown[]) => mockGetJdBaseByJobId(...args),
}));

const JOB_ID = fakeUuid("0001");
const CANDIDATE_ID = fakeUuid("0002");

// ---------------------------------------------------------------------------
// GET /api/fit-score
// ---------------------------------------------------------------------------
describe("GET /api/fit-score", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockListForOrg.mockClear();
    mockListForHiringManager.mockClear();
    mockListForJob.mockClear();
    mockListForCandidate.mockClear();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    vi.resetModules();
    const { GET } = await import("@/app/api/fit-score/route");
    const req = new NextRequest("http://localhost:3000/api/fit-score");
    const res = await GET(req);
    expect(res.status).toBe(401);
  }, 30_000);

  it("returns org scores for leadership without query params", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    mockListForOrg.mockResolvedValue([{ id: "fs-1" }]);
    const { GET } = await import("@/app/api/fit-score/route");
    const req = new NextRequest("http://localhost:3000/api/fit-score");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fitScores).toEqual([{ id: "fs-1" }]);
  });

  it("returns hiring manager scores without query params", async () => {
    mockGetAuthContext.mockResolvedValue(hiringManagerCtx);
    mockListForHiringManager.mockResolvedValue([{ id: "fs-hm" }]);
    const { GET } = await import("@/app/api/fit-score/route");
    const req = new NextRequest("http://localhost:3000/api/fit-score");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fitScores).toEqual([{ id: "fs-hm" }]);
  });

  it("returns 400 for candidate without query params", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { GET } = await import("@/app/api/fit-score/route");
    const req = new NextRequest("http://localhost:3000/api/fit-score");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns scores by jobId", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockListForJob.mockResolvedValue([{ id: "fs-j" }]);
    const { GET } = await import("@/app/api/fit-score/route");
    const req = new NextRequest(`http://localhost:3000/api/fit-score?jobId=${JOB_ID}&t=err`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scores).toEqual([{ id: "fs-j" }]);
  });

  it("returns scores by candidateId", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockListForCandidate.mockResolvedValue([{ id: "fs-c" }]);
    const { GET } = await import("@/app/api/fit-score/route");
    const req = new NextRequest(`http://localhost:3000/api/fit-score?candidateId=${CANDIDATE_ID}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scores).toEqual([{ id: "fs-c" }]);
  });

  it("returns 500 when service throws", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockListForJob.mockRejectedValueOnce(new Error("db fail"));
    const { GET } = await import("@/app/api/fit-score/route");
    const req = new NextRequest(`http://localhost:3000/api/fit-score?jobId=${JOB_ID}`);
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /api/fit-score
// ---------------------------------------------------------------------------
describe("POST /api/fit-score", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockComputeSingle.mockClear();
    mockComputeBatch.mockClear();
    mockMarkDeferredScore.mockClear();
    mockGetLatestProductionScore.mockClear();
    mockServerFrom.mockReset();
    mockAdminFrom.mockReset();
    mockGetJdBaseByJobId.mockReset();
    mockGetJdBaseByJobId.mockResolvedValue({ approvedBy: "hm-1" });
    mockAssertJobAccess.mockResolvedValue({
      job: { id: JOB_ID, organisation_id: "org-1", hiring_manager_id: null },
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/fit-score/route");
    const req = new NextRequest("http://localhost:3000/api/fit-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: JOB_ID, candidateId: CANDIDATE_ID }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("blocks candidate manual score requests", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const candidateLookupBuilder = createMockQueryBuilder({
      data: { id: CANDIDATE_ID },
    });
    const fitScoresBuilder = createMockQueryBuilder({ data: [] });
    let fromCallCount = 0;
    mockServerFrom.mockImplementation(() => {
      fromCallCount++;
      return fromCallCount === 1 ? candidateLookupBuilder : fitScoresBuilder;
    });
    const { POST } = await import("@/app/api/fit-score/route");
    const req = new NextRequest("http://localhost:3000/api/fit-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: JOB_ID, candidateId: CANDIDATE_ID }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(mockComputeSingle).not.toHaveBeenCalled();
  });

  it("returns 202 pending for single score compute by default", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const builder = createMockQueryBuilder({
      data: [{ candidate_id: CANDIDATE_ID }],
    });
    mockServerFrom.mockReturnValue(builder);

    const { POST } = await import("@/app/api/fit-score/route");
    const req = new NextRequest("http://localhost:3000/api/fit-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: JOB_ID, candidateId: CANDIDATE_ID }),
    });
    const res = await POST(req);
    expect(res.status).toBe(202);
    expect(mockComputeBatch).not.toHaveBeenCalled();
  });

  it("returns 201 for batch compute with candidateIds", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    const { POST } = await import("@/app/api/fit-score/route");
    const req = new NextRequest("http://localhost:3000/api/fit-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: JOB_ID, candidateIds: [CANDIDATE_ID] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(mockComputeBatch).toHaveBeenCalledOnce();
  });

  it("returns 400 for batch when no candidates found", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const builder = createMockQueryBuilder({ data: [] });
    mockServerFrom.mockReturnValue(builder);

    const { POST } = await import("@/app/api/fit-score/route");
    const req = new NextRequest("http://localhost:3000/api/fit-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: JOB_ID }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 422 for invalid single request body", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/fit-score/route");
    const req = new NextRequest("http://localhost:3000/api/fit-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: "not-uuid", candidateId: "bad" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it("returns 428 when JD Base is not approved", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockGetJdBaseByJobId.mockResolvedValueOnce({ approvedBy: null });
    const { POST } = await import("@/app/api/fit-score/route");
    const req = new NextRequest("http://localhost:3000/api/fit-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: JOB_ID, candidateId: CANDIDATE_ID }),
    });
    const res = await POST(req);
    expect(res.status).toBe(428);
    const body = await res.json();
    expect(body.code).toBe("jd_base_not_approved");
    expect(mockComputeSingle).not.toHaveBeenCalled();
  });

  it("returns 500 when service throws", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    mockComputeSingle.mockRejectedValueOnce(new Error("AI error"));
    const { POST } = await import("@/app/api/fit-score/route");
    const req = new NextRequest("http://localhost:3000/api/fit-score?sync=1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: JOB_ID, candidateId: CANDIDATE_ID }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it("returns 202 deferred when sync scoring hits transient 429", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    mockComputeSingle.mockRejectedValueOnce(new Error("429 rate limit"));
    mockGetLatestProductionScore.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/fit-score/route");
    const req = new NextRequest("http://localhost:3000/api/fit-score?sync=1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: JOB_ID, candidateId: CANDIDATE_ID }),
    });
    const res = await POST(req);
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.scoring_status).toBe("deferred");
    expect(mockMarkDeferredScore).toHaveBeenCalled();
  });

  it("returns latest stale score when deferred sync scoring has previous score", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    mockComputeSingle.mockRejectedValueOnce(new Error("429 too many requests"));
    mockGetLatestProductionScore.mockResolvedValueOnce({
      id: "fs-old",
      overall_score: 74,
      band: "Amber",
    });
    const { POST } = await import("@/app/api/fit-score/route");
    const req = new NextRequest("http://localhost:3000/api/fit-score?sync=1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: JOB_ID, candidateId: CANDIDATE_ID }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.score.stale).toBe(true);
    expect(body.score.scoring_status).toBe("deferred");
  });
});

// ---------------------------------------------------------------------------
// GET /api/fit-score/[id]
// ---------------------------------------------------------------------------
describe("GET /api/fit-score/[id]", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockServerFrom.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/fit-score/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/fit-score/fs-1");
    const res = await GET(req, { params: Promise.resolve({ id: "fs-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when score not found", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const builder = createMockQueryBuilder({
      data: null,
      error: { code: "PGRST116" },
    });
    mockServerFrom.mockReturnValue(builder);

    const { GET } = await import("@/app/api/fit-score/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/fit-score/fs-x");
    const res = await GET(req, { params: Promise.resolve({ id: "fs-x" }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 when recruiter accesses another org score", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const builder = createMockQueryBuilder({
      data: {
        id: "fs-1",
        overall_score: 80,
        job_id: JOB_ID,
        candidate_id: CANDIDATE_ID,
        jobs: { id: JOB_ID, title: "Dev", organisation_id: "other-org" },
        candidates: { id: CANDIDATE_ID, name: "Jane" },
        created_at: "2025-01-01",
      },
    });
    mockServerFrom.mockReturnValue(builder);

    const { GET } = await import("@/app/api/fit-score/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/fit-score/fs-1");
    const res = await GET(req, { params: Promise.resolve({ id: "fs-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 with full score for recruiter in same org", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const scoreData = {
      id: "fs-1",
      overall_score: 80,
      job_id: JOB_ID,
      candidate_id: CANDIDATE_ID,
      jobs: {
        id: JOB_ID,
        title: "Dev",
        organisation_id: recruiterCtx.organisationId,
      },
      candidates: {
        id: CANDIDATE_ID,
        name: "Jane",
        skills: ["React"],
        location: "NYC",
      },
      created_at: "2025-01-01",
    };
    const builder = createMockQueryBuilder({ data: scoreData });
    mockServerFrom.mockReturnValue(builder);

    const { GET } = await import("@/app/api/fit-score/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/fit-score/fs-1");
    const res = await GET(req, { params: Promise.resolve({ id: "fs-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.score.id).toBe("fs-1");
  });

  it("returns restricted score for candidate_free", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const scoreData = {
      id: "fs-1",
      overall_score: 80,
      job_id: JOB_ID,
      candidate_id: CANDIDATE_ID,
      created_at: "2025-01-01",
      jobs: { id: JOB_ID, title: "Dev", organisation_id: "org-1" },
      candidates: { id: CANDIDATE_ID, name: "Jane" },
    };
    const selectBuilder = createMockQueryBuilder({ data: scoreData });
    const candidateLookupBuilder = createMockQueryBuilder({
      data: { user_id: candidateCtx.userId },
    });

    let fromCallCount = 0;
    mockServerFrom.mockImplementation(() => {
      fromCallCount++;
      return fromCallCount === 1 ? selectBuilder : candidateLookupBuilder;
    });

    const { GET } = await import("@/app/api/fit-score/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/fit-score/fs-1");
    const res = await GET(req, { params: Promise.resolve({ id: "fs-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.score.overall_score).toBe(80);
    expect(body.score.candidates).toBeUndefined();
  });

  it("returns 403 when candidate views another candidates score", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const scoreData = {
      id: "fs-1",
      overall_score: 80,
      job_id: JOB_ID,
      candidate_id: CANDIDATE_ID,
      created_at: "2025-01-01",
      jobs: { id: JOB_ID, title: "Dev", organisation_id: "org-1" },
      candidates: { id: CANDIDATE_ID, name: "Jane" },
    };
    const selectBuilder = createMockQueryBuilder({ data: scoreData });
    const candidateLookupBuilder = createMockQueryBuilder({
      data: { user_id: "other-user" },
    });

    let fromCallCount = 0;
    mockServerFrom.mockImplementation(() => {
      fromCallCount++;
      return fromCallCount === 1 ? selectBuilder : candidateLookupBuilder;
    });

    const { GET } = await import("@/app/api/fit-score/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/fit-score/fs-1");
    const res = await GET(req, { params: Promise.resolve({ id: "fs-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 500 when an unexpected error occurs", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const builder = createMockQueryBuilder();
    (builder as any).single = vi.fn().mockRejectedValue(new Error("boom"));
    mockServerFrom.mockReturnValue(builder);

    const { GET } = await import("@/app/api/fit-score/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/fit-score/fs-1");
    const res = await GET(req, { params: Promise.resolve({ id: "fs-1" }) });
    expect(res.status).toBe(500);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  createMockSupabase,
  createMockQueryBuilder,
  recruiterCtx,
  candidateCtx,
  companyAdminCtx,
  agencyCtx,
  superAdminCtx,
  buildRequest,
  createTenantScopedClientMock,
} from "../helpers";

/* ------------------------------------------------------------------ */
/*  Mock layer – mirrors the pattern used across existing unit tests   */
/* ------------------------------------------------------------------ */

const mockGetAuthContext = vi.fn();
const mockGetTenantScopedClient = vi.fn(async () => createTenantScopedClientMock());

vi.mock("@/lib/redis/job-cache", () => ({
  getCachedJobList: vi.fn().mockResolvedValue(null),
  setCachedJobList: vi.fn().mockResolvedValue(undefined),
  invalidateJobCache: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  getTenantScopedClient: (...args: unknown[]) => mockGetTenantScopedClient(...args),
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
  handleApiError: (_err: unknown, msg: string) =>
    new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
  reportError: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(createMockSupabase()),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/services/CandidateService", () => ({
  CandidateService: {
    listMasked: vi.fn().mockResolvedValue({
      candidates: [{ id: "c1", name_masked: "J***", skills: ["TypeScript"] }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    }),
    getByUserId: vi.fn().mockResolvedValue({ id: "c1", email: "c@test.com", name: "Cand" }),
  },
}));

vi.mock("@/lib/repositories/CandidateRepository", () => ({
  getAccessibleCandidateIdsForOrgs: vi.fn().mockResolvedValue(["c1"]),
  CandidateRepository: {},
}));

vi.mock("@/lib/services/JobService", () => ({
  JobService: {
    list: vi.fn().mockResolvedValue({
      jobs: [{ id: "j1", title: "Engineer", status: "open" }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    }),
    create: vi.fn().mockResolvedValue({ id: "j-new", title: "New Job" }),
  },
}));

vi.mock("@/lib/services/ApplicationService", () => ({
  ApplicationService: {
    listForCandidate: vi.fn().mockResolvedValue({
      applications: [{ id: "a1", status: "applied" }],
      pagination: { page: 1, limit: 30, total: 1, totalPages: 1 },
    }),
    listForRecruiter: vi.fn().mockResolvedValue({
      applications: [{ id: "a1", status: "applied" }],
      pagination: { page: 1, limit: 30, total: 1, totalPages: 1 },
    }),
    create: vi.fn().mockResolvedValue({ id: "a-new", status: "applied" }),
  },
}));

vi.mock("@/lib/services/FitScoreService", () => ({
  FitScoreService: { computeSingle: vi.fn().mockResolvedValue(null) },
}));

vi.mock("@/lib/redis/job-cache", () => ({
  getCachedJobList: vi.fn().mockResolvedValue(null),
  setCachedJobList: vi.fn().mockResolvedValue(undefined),
  invalidateJobCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => createMockSupabase(),
}));

vi.mock("@/lib/redis", () => ({
  checkRedis: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/redis/cache", () => ({
  getCacheMetrics: vi.fn().mockReturnValue({ hits: 0, misses: 0 }),
}));

vi.mock("@/lib/config/env", () => ({
  env: {},
}));

vi.mock("@/lib/observability/report-error", () => ({
  reportError: vi.fn(),
}));

vi.mock("@/lib/observability/with-correlation", () => ({
  withCorrelation:
    (fn: Function) =>
    (req: NextRequest, ...args: unknown[]) =>
      fn(req, ...args),
}));

vi.mock("@/lib/observability/route-span", () => ({
  withRouteSpan: (_name: string, fn: Function) => fn(),
}));

vi.mock("@/lib/jobs/queue", () => ({
  enqueue: vi.fn().mockResolvedValue({ id: "q1" }),
}));

vi.mock("@/lib/services/resend", () => ({
  sendApplicationConfirmation: vi.fn().mockResolvedValue(undefined),
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Build a NextRequest with the given URL (includes query params). */
function makeReq(url: string): NextRequest {
  return new NextRequest(url);
}

/** Default candidates URL with valid query params. */
const CANDIDATES_URL =
  "http://localhost/api/candidates?page=1&limit=20&sortBy=created_at&sortOrder=desc";
/** Default jobs URL with valid query params. */
const JOBS_URL = "http://localhost/api/jobs?page=1&limit=20&sortBy=created_at&sortOrder=desc";
/** Default applications URL with valid query params. */
const APPLICATIONS_URL = "http://localhost/api/applications?page=1&limit=30";
/** Health URL. */
const HEALTH_URL = "http://localhost/api/health";

/** Parse a Response as JSON and return both body and response. */
async function parseResponse(res: Response) {
  const body = await res.json();
  return { body, status: res.status, contentType: res.headers.get("Content-Type") };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("API Response Shape Contract Tests", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAuthContext.mockReset();
  });

  /* ---- Error response shapes ---- */

  describe("Error responses follow consistent schema", () => {
    it("401 responses have { error: string } shape", async () => {
      mockGetAuthContext.mockResolvedValue(null);
      const { GET } = await import("@/app/api/candidates/route");
      const res = await GET(makeReq(CANDIDATES_URL));
      const { body, status } = await parseResponse(res);

      expect(status).toBe(401);
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
      expect(body.error).toBe("Unauthorized");
    });

    it("403 responses have { error: string } shape", async () => {
      mockGetAuthContext.mockResolvedValue(candidateCtx);
      const { GET } = await import("@/app/api/candidates/route");
      const res = await GET(makeReq(CANDIDATES_URL));
      const { body, status } = await parseResponse(res);

      expect(status).toBe(403);
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });

    it("422 responses from Zod validation have { error: string } shape", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);
      const { GET } = await import("@/app/api/candidates/route");
      const res = await GET(makeReq("http://localhost/api/candidates?sortBy=INVALID_SORT"));
      const { body, status } = await parseResponse(res);

      expect(status).toBe(422);
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
    });

    it("error responses never include 'data' field", async () => {
      mockGetAuthContext.mockResolvedValue(null);
      const { GET } = await import("@/app/api/candidates/route");
      const res = await GET(makeReq(CANDIDATES_URL));
      const { body } = await parseResponse(res);

      expect(body).not.toHaveProperty("data");
      expect(body).not.toHaveProperty("candidates");
      expect(body).not.toHaveProperty("jobs");
    });

    it("error responses always have Content-Type: application/json", async () => {
      mockGetAuthContext.mockResolvedValue(null);
      const { GET } = await import("@/app/api/candidates/route");
      const res = await GET(makeReq(CANDIDATES_URL));

      expect(res.headers.get("Content-Type")).toContain("application/json");
    });
  });

  /* ---- Success response shapes ---- */

  describe("Success responses include expected fields", () => {
    it("GET /api/candidates returns { candidates: [], pagination: {} }", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);
      const { GET } = await import("@/app/api/candidates/route");
      const res = await GET(makeReq(CANDIDATES_URL));
      const { body, status } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body).toHaveProperty("candidates");
      expect(Array.isArray(body.candidates)).toBe(true);
      expect(body).toHaveProperty("pagination");
      expect(body.pagination).toHaveProperty("page");
      expect(body.pagination).toHaveProperty("limit");
      expect(body.pagination).toHaveProperty("total");
      expect(body.pagination).toHaveProperty("totalPages");
    });

    it("GET /api/jobs returns { jobs: [], pagination: {} }", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);
      const { GET } = await import("@/app/api/jobs/route");
      const res = await GET(makeReq(JOBS_URL));
      const { body, status } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body).toHaveProperty("jobs");
      expect(Array.isArray(body.jobs)).toBe(true);
      expect(body).toHaveProperty("pagination");
    });

    it("GET /api/applications returns { applications: [], pagination: {} }", async () => {
      mockGetAuthContext.mockResolvedValue(candidateCtx);
      const { GET } = await import("@/app/api/applications/route");
      const res = await GET(makeReq(APPLICATIONS_URL));
      const { body, status } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body).toHaveProperty("applications");
      expect(Array.isArray(body.applications)).toBe(true);
      expect(body).toHaveProperty("pagination");
    });

    it("GET /api/health returns { ok: true }", async () => {
      const { GET } = await import("@/app/api/health/route");
      const res = await GET(makeReq(HEALTH_URL));
      const { body, status } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body).toHaveProperty("ok");
      expect(body.ok).toBe(true);
    });

    it("success list responses never include 'error' field", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);
      const { GET } = await import("@/app/api/candidates/route");
      const res = await GET(makeReq(CANDIDATES_URL));
      const { body } = await parseResponse(res);

      expect(body).not.toHaveProperty("error");
    });
  });

  /* ---- Pagination contract ---- */

  describe("Pagination follows consistent pattern", () => {
    it("candidates pagination returns { page, limit, total, totalPages }", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);
      const { GET } = await import("@/app/api/candidates/route");
      const res = await GET(makeReq(CANDIDATES_URL));
      const { body } = await parseResponse(res);

      const p = body.pagination;
      expect(typeof p.page).toBe("number");
      expect(typeof p.limit).toBe("number");
      expect(typeof p.total).toBe("number");
      expect(typeof p.totalPages).toBe("number");
      expect(p.page).toBeGreaterThanOrEqual(1);
      expect(p.limit).toBeGreaterThanOrEqual(1);
      expect(p.total).toBeGreaterThanOrEqual(0);
      expect(p.totalPages).toBeGreaterThanOrEqual(0);
    });

    it("jobs pagination returns { page, limit, total, totalPages }", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);
      const { GET } = await import("@/app/api/jobs/route");
      const res = await GET(makeReq(JOBS_URL));
      const { body } = await parseResponse(res);

      const p = body.pagination;
      expect(typeof p.page).toBe("number");
      expect(typeof p.limit).toBe("number");
      expect(typeof p.total).toBe("number");
      expect(typeof p.totalPages).toBe("number");
    });

    it("applications pagination returns { page, limit, total, totalPages }", async () => {
      mockGetAuthContext.mockResolvedValue(candidateCtx);
      const { GET } = await import("@/app/api/applications/route");
      const res = await GET(makeReq(APPLICATIONS_URL));
      const { body } = await parseResponse(res);

      const p = body.pagination;
      expect(typeof p.page).toBe("number");
      expect(typeof p.limit).toBe("number");
      expect(typeof p.total).toBe("number");
      expect(typeof p.totalPages).toBe("number");
    });

    it("empty result sets still return valid pagination", async () => {
      // recruiter with no org => empty result
      mockGetAuthContext.mockResolvedValue({ ...recruiterCtx, organisationId: null });
      const { GET } = await import("@/app/api/candidates/route");
      const res = await GET(makeReq(CANDIDATES_URL));
      const { body, status } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.candidates).toEqual([]);
      expect(body.pagination.total).toBe(0);
      expect(body.pagination.totalPages).toBe(0);
    });
  });

  /* ---- Response status code contract ---- */

  describe("Status codes are semantically correct", () => {
    it("unauthenticated requests return 401, not 403", async () => {
      mockGetAuthContext.mockResolvedValue(null);
      const { GET } = await import("@/app/api/candidates/route");
      const res = await GET(makeReq(CANDIDATES_URL));

      expect(res.status).toBe(401);
    });

    it("unauthorized role returns 403, not 401", async () => {
      mockGetAuthContext.mockResolvedValue(candidateCtx);
      const { GET } = await import("@/app/api/candidates/route");
      const res = await GET(makeReq(CANDIDATES_URL));

      expect(res.status).toBe(403);
    });

    it("validation errors return 422", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);
      const { GET } = await import("@/app/api/candidates/route");
      const res = await GET(makeReq("http://localhost/api/candidates?page=-5&sortBy=created_at"));

      expect(res.status).toBe(422);
    });
  });
});

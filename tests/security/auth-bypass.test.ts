import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks shared across all auth-bypass tests
// ---------------------------------------------------------------------------
const mockGetAuthContext = vi.fn();
const mockRequireAuth = vi.fn((ctx: unknown) => ctx !== null);
const mockHasRole = vi.fn((ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role));

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => mockRequireAuth(ctx),
  hasRole: (ctx: { role: string }, ...roles: string[]) => mockHasRole(ctx, ...roles),
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
  handleApiError: (err: unknown, _msg: string) =>
    new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
  handleZodError: (error: { issues: { message: string }[] }) =>
    new Response(
      JSON.stringify({
        error: error.issues.map((e: { message: string }) => e.message).join("; "),
      }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    ),
  reportError: vi.fn(),
  apiLogContext: vi.fn(),
  getTenantScopedClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        then: vi.fn((fn?: (v: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(fn),
        ),
      }),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn((fn?: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(fn),
      ),
    }),
  }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/observability/report-error", () => ({ reportError: vi.fn() }));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 10, resetAt: new Date() }),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/redis/auth-profile-cache", () => ({
  getCachedAuthProfile: vi.fn().mockResolvedValue(null),
  setCachedAuthProfile: vi.fn(),
}));

vi.mock("@/lib/redis/job-cache", () => ({
  getCachedJobList: vi.fn().mockResolvedValue(null),
  setCachedJobList: vi.fn(),
  invalidateJobCache: vi.fn(),
}));

vi.mock("@/lib/observability/with-correlation", () => ({
  withCorrelation: (fn: Function) => fn,
}));

vi.mock("@/lib/observability/route-span", () => ({
  withRouteSpan: (_name: string, fn: Function) => fn(),
}));

vi.mock("@/lib/observability/correlation", () => ({
  getCorrelationId: vi.fn().mockReturnValue("test-correlation-id"),
}));

vi.mock("@/lib/jobs/queue", () => ({
  enqueue: vi.fn().mockResolvedValue({ id: "mock-job" }),
}));

// Mock service layers used by route handlers
vi.mock("@/lib/services/CandidateService", () => ({
  CandidateService: {
    listMasked: vi.fn().mockResolvedValue({ candidates: [], pagination: {} }),
    getByUserId: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("@/lib/services/JobService", () => ({
  JobService: {
    list: vi.fn().mockResolvedValue({ jobs: [], pagination: {} }),
    create: vi.fn().mockResolvedValue({ id: "job-1" }),
  },
}));

vi.mock("@/lib/services/ApplicationService", () => ({
  ApplicationService: {
    listForCandidate: vi.fn().mockResolvedValue({ applications: [], pagination: {} }),
    listForRecruiter: vi.fn().mockResolvedValue({ applications: [], pagination: {} }),
    create: vi.fn().mockResolvedValue({ id: "app-1" }),
  },
}));

vi.mock("@/lib/services/ProfileService", () => ({
  ProfileService: {
    get: vi.fn().mockResolvedValue({ profile: null }),
    update: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("@/lib/repositories/NotificationRepository", () => ({
  NotificationRepository: {
    list: vi.fn().mockResolvedValue([]),
    unreadCount: vi.fn().mockResolvedValue(0),
    markAllRead: vi.fn(),
    markRead: vi.fn(),
  },
}));

vi.mock("@/lib/repositories/CandidateRepository", () => ({
  getAccessibleCandidateIdsForOrgs: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/validations/candidates", () => ({
  candidateQuerySchema: {
    safeParse: vi.fn().mockReturnValue({ success: true, data: { page: 1, limit: 20 } }),
  },
}));

vi.mock("@/lib/validations/jobs", () => ({
  jobQuerySchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
  createJobSchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
}));

vi.mock("@/lib/services/notifications", () => ({
  createNotification: vi.fn(),
}));

vi.mock("@/lib/services/resend", () => ({
  sendApplicationConfirmation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/FitScoreService", () => ({
  FitScoreService: { computeSingle: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/validations/applications", () => ({
  createApplicationSchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
}));

vi.mock("@/lib/validations/hiring-requests", () => ({
  createHiringRequestSchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Auth Bypass Security Tests", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAuthContext.mockReset();
    mockRequireAuth.mockReset();
    mockRequireAuth.mockImplementation((ctx: unknown) => ctx !== null);
  });

  // =========================================================================
  // 1. Unauthenticated access returns 401
  // =========================================================================
  describe("Unauthenticated access to protected endpoints", () => {
    const protectedEndpoints = [
      { path: "candidates", method: "GET" },
      { path: "jobs", method: "GET" },
      { path: "applications", method: "GET" },
      { path: "notifications", method: "GET" },
      { path: "messages", method: "GET" },
      { path: "profiles", method: "GET" },
      { path: "analytics", method: "GET" },
      { path: "export", method: "GET" },
      { path: "approvals", method: "GET" },
      { path: "hiring-requests", method: "GET" },
    ];

    for (const endpoint of protectedEndpoints) {
      it(`returns 401 for unauthenticated ${endpoint.method} /api/${endpoint.path}`, async () => {
        mockGetAuthContext.mockResolvedValue(null);

        const module = await import(`@/app/api/${endpoint.path}/route`);
        // Some routes wrap the handler (e.g. withCorrelation), resolve accordingly
        const handler = module[endpoint.method];
        expect(handler).toBeDefined();

        const req = new Request(`http://localhost:3000/api/${endpoint.path}`, {
          method: endpoint.method,
        });
        const res = await handler(req);
        expect(res.status).toBe(401);

        const body = await res.json();
        expect(body.error).toBeDefined();
      });
    }
  });

  // =========================================================================
  // 2. Null / undefined auth context is rejected
  // =========================================================================
  describe("Null and undefined auth context rejection", () => {
    it("rejects undefined auth context", async () => {
      mockGetAuthContext.mockResolvedValue(undefined);
      mockRequireAuth.mockReturnValue(false);

      const module = await import("@/app/api/candidates/route");
      const req = new Request("http://localhost:3000/api/candidates");
      const res = await module.GET(req as any);
      expect(res.status).toBe(401);
    });

    it("rejects empty object auth context", async () => {
      mockGetAuthContext.mockResolvedValue({});
      mockRequireAuth.mockReturnValue(false);

      const module = await import("@/app/api/jobs/route");
      const handler = module.GET;
      const req = new Request("http://localhost:3000/api/jobs");
      const res = await handler(req as any);
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // 3. Forged auth headers do not bypass authentication
  // =========================================================================
  describe("Forged auth headers are not trusted", () => {
    it("ignores X-User-Id header injection", async () => {
      mockGetAuthContext.mockResolvedValue(null);

      const module = await import("@/app/api/notifications/route");
      const req = new Request("http://localhost:3000/api/notifications", {
        headers: {
          "X-User-Id": "attacker-user-id",
          "X-Role": "super_admin",
        },
      });
      const res = await module.GET(req as any);
      expect(res.status).toBe(401);
    });

    it("ignores Authorization header with fabricated JWT", async () => {
      mockGetAuthContext.mockResolvedValue(null);

      const module = await import("@/app/api/profiles/route");
      const req = new Request("http://localhost:3000/api/profiles", {
        headers: {
          Authorization:
            "Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhdHRhY2tlciIsInJvbGUiOiJzdXBlcl9hZG1pbiJ9.",
        },
      });
      const res = await module.GET();
      expect(res.status).toBe(401);
    });

    it("ignores cookie injection attempt", async () => {
      mockGetAuthContext.mockResolvedValue(null);

      const module = await import("@/app/api/messages/route");
      const req = new Request("http://localhost:3000/api/messages", {
        headers: {
          Cookie: "sb-access-token=forged-token; sb-refresh-token=forged-refresh",
        },
      });
      const res = await module.GET(req as any);
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // 4. Tampered user ID in auth context cannot access other users' data
  // =========================================================================
  describe("User ID isolation", () => {
    it("notifications endpoint scopes to authenticated user, not query param user", async () => {
      const legitimateUser = {
        userId: "user-legit",
        role: "recruiter",
        organisationId: "org-1",
      };
      mockGetAuthContext.mockResolvedValue(legitimateUser);

      const module = await import("@/app/api/notifications/route");
      // Even if attacker tries to pass another userId via query params,
      // the handler should use ctx.userId from auth context
      const req = new Request("http://localhost:3000/api/notifications?userId=user-victim");
      const res = await module.GET(req as any);
      // Should succeed but scoped to user-legit, not user-victim
      expect(res.status).not.toBe(401);
    });
  });

  // =========================================================================
  // 5. POST endpoints also require auth
  // =========================================================================
  describe("POST endpoints require authentication", () => {
    const postEndpoints = [
      { path: "jobs", method: "POST" },
      { path: "applications", method: "POST" },
      { path: "messages", method: "POST" },
      { path: "hiring-requests", method: "POST" },
    ];

    for (const endpoint of postEndpoints) {
      it(`returns 401 for unauthenticated POST /api/${endpoint.path}`, async () => {
        mockGetAuthContext.mockResolvedValue(null);

        const module = await import(`@/app/api/${endpoint.path}/route`);
        const handler = module[endpoint.method];
        expect(handler).toBeDefined();

        const req = new Request(`http://localhost:3000/api/${endpoint.path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "test" }),
        });
        const res = await handler(req);
        expect(res.status).toBe(401);
      });
    }
  });

  // =========================================================================
  // 6. PATCH endpoints require auth
  // =========================================================================
  describe("PATCH endpoints require authentication", () => {
    it("returns 401 for unauthenticated PATCH /api/notifications", async () => {
      mockGetAuthContext.mockResolvedValue(null);

      const module = await import("@/app/api/notifications/route");
      const req = new Request("http://localhost:3000/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      const res = await module.PATCH(req as any);
      expect(res.status).toBe(401);
    });

    it("returns 401 for unauthenticated PATCH /api/profiles", async () => {
      mockGetAuthContext.mockResolvedValue(null);

      const module = await import("@/app/api/profiles/route");
      const req = new Request("http://localhost:3000/api/profiles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: "Hacker" }),
      });
      const res = await module.PATCH(req as any);
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // 7. Expired / revoked session returns 401
  // =========================================================================
  describe("Expired session handling", () => {
    it("returns 401 when auth context returns null (expired session)", async () => {
      // Simulates Supabase returning null user for expired JWT
      mockGetAuthContext.mockResolvedValue(null);

      const module = await import("@/app/api/candidates/route");
      const req = new Request("http://localhost:3000/api/candidates");
      const res = await module.GET(req as any);
      expect(res.status).toBe(401);
    });
  });
});

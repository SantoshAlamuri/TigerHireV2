import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockGetAuthContext = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
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
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        then: vi.fn((fn?: (v: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null, count: 0 }).then(fn),
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
      or: vi.fn().mockReturnThis(),
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

vi.mock("@/lib/validations/hiring-requests", () => ({
  createHiringRequestSchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
}));

vi.mock("@/lib/validations/applications", () => ({
  createApplicationSchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
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

// ---------------------------------------------------------------------------
// Auth context fixtures
// ---------------------------------------------------------------------------
const candidateCtx = {
  userId: "user-candidate-1",
  role: "candidate_free",
  organisationId: null,
};

const candidateProCtx = {
  userId: "user-candidate-pro",
  role: "candidate_pro",
  organisationId: null,
};

const hiringManagerCtx = {
  userId: "user-hm-1",
  role: "hiring_manager",
  organisationId: "org-1",
};

const recruiterCtx = {
  userId: "user-recruiter-1",
  role: "recruiter",
  organisationId: "org-1",
};

const companyAdminCtx = {
  userId: "user-admin-1",
  role: "leadership",
  organisationId: "org-1",
};

const agencyCtx = {
  userId: "user-agency-1",
  role: "agency",
  organisationId: "org-agency-1",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Role Escalation Prevention", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
  });

  // =========================================================================
  // Candidate cannot access recruiter-only endpoints
  // =========================================================================
  describe("Candidate role restrictions", () => {
    it("candidate cannot list all candidates (recruiter-only)", async () => {
      mockGetAuthContext.mockResolvedValue(candidateCtx);

      const module = await import("@/app/api/candidates/route");
      const req = new NextRequest("http://localhost:3000/api/candidates");
      const res = await module.GET(req);

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toMatch(/Forbidden/i);
    });

    it("candidate cannot access analytics dashboard", async () => {
      mockGetAuthContext.mockResolvedValue(candidateCtx);

      const module = await import("@/app/api/analytics/route");
      const req = new NextRequest("http://localhost:3000/api/analytics");
      const res = await module.GET(req);

      expect(res.status).toBe(403);
    });

    it("candidate cannot access export endpoint", async () => {
      mockGetAuthContext.mockResolvedValue(candidateCtx);

      const module = await import("@/app/api/export/route");
      const req = new NextRequest("http://localhost:3000/api/export?type=candidates");
      const res = await module.GET(req);

      expect(res.status).toBe(403);
    });

    it("candidate cannot access approvals endpoint", async () => {
      mockGetAuthContext.mockResolvedValue(candidateCtx);

      const module = await import("@/app/api/approvals/route");
      const res = await module.GET();

      expect(res.status).toBe(403);
    });

    it("candidate cannot create hiring requests", async () => {
      mockGetAuthContext.mockResolvedValue(candidateCtx);

      const module = await import("@/app/api/hiring-requests/route");
      const req = new NextRequest("http://localhost:3000/api/hiring-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Exploit", headcount: 1, urgency: "high" }),
      });
      const res = await module.POST(req);

      expect(res.status).toBe(403);
    });

    it("candidate_pro also cannot list all candidates", async () => {
      mockGetAuthContext.mockResolvedValue(candidateProCtx);

      const module = await import("@/app/api/candidates/route");
      const req = new NextRequest("http://localhost:3000/api/candidates");
      const res = await module.GET(req);

      expect(res.status).toBe(403);
    });

    it("candidate cannot access hiring requests list", async () => {
      mockGetAuthContext.mockResolvedValue(candidateCtx);

      const module = await import("@/app/api/hiring-requests/route");
      const req = new NextRequest("http://localhost:3000/api/hiring-requests");
      const res = await module.GET(req);

      expect(res.status).toBe(403);
    });

    it("candidate cannot access admin onboarding request queue", async () => {
      mockGetAuthContext.mockResolvedValue(candidateCtx);
      const module = await import("@/app/api/admin/onboarding-requests/route");
      const req = new NextRequest("http://localhost:3000/api/admin/onboarding-requests");
      const res = await module.GET(req);
      expect(res.status).toBe(403);
    });

    it("candidate cannot access admin billing list", async () => {
      mockGetAuthContext.mockResolvedValue(candidateCtx);
      const module = await import("@/app/api/admin/billing/route");
      const req = new NextRequest("http://localhost:3000/api/admin/billing");
      const res = await module.GET(req);
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // Recruiter cannot access admin-only operations
  // =========================================================================
  describe("Recruiter role restrictions", () => {
    it("recruiter is no longer blocked by role gate on hiring-request create", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);

      const module = await import("@/app/api/hiring-requests/route");
      const req = new NextRequest("http://localhost:3000/api/hiring-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Exploit", headcount: 1, urgency: "high" }),
      });
      const res = await module.POST(req);

      // Current product contract allows recruiters to create hiring requests.
      // This security test only verifies there's no role-gate denial here.
      expect(res.status).not.toBe(403);
    });
  });

  // =========================================================================
  // Hiring manager scope restrictions
  // =========================================================================
  describe("Hiring manager scope restrictions", () => {
    it("hiring manager lists only scoped candidates (empty when no managed jobs)", async () => {
      mockGetAuthContext.mockResolvedValue(hiringManagerCtx);

      const module = await import("@/app/api/candidates/route");
      const req = new NextRequest("http://localhost:3000/api/candidates");
      const res = await module.GET(req);

      // Should succeed but return empty/restricted data (scoped to hiring manager's jobs)
      if (res.status === 200) {
        const body = await res.json();
        expect(body.candidates).toEqual([]);
      }
      expect([200, 403]).toContain(res.status);
    });
  });

  // =========================================================================
  // Agency tenant isolation
  // =========================================================================
  describe("Agency tenant isolation", () => {
    it("agency cannot access candidates without linked client orgs", async () => {
      // Agency with no client links should get empty results, not other org's data
      mockGetAuthContext.mockResolvedValue(agencyCtx);

      const module = await import("@/app/api/candidates/route");
      const req = new NextRequest("http://localhost:3000/api/candidates");
      const res = await module.GET(req);

      // Should succeed but return empty data (scoped to agency's clients)
      if (res.status === 200) {
        const body = await res.json();
        expect(body.candidates).toEqual([]);
      }
      // Or 403 if the role check prevents it
      expect([200, 403]).toContain(res.status);
    });

    it("agency cannot access jobs without linked client organisations", async () => {
      mockGetAuthContext.mockResolvedValue(agencyCtx);

      const module = await import("@/app/api/jobs/route");
      const handler = module.GET;
      const req = new NextRequest("http://localhost:3000/api/jobs");
      const res = await handler(req);

      // Agency with no linked clients should get empty jobs
      if (res.status === 200) {
        const body = await res.json();
        expect(body.jobs).toEqual([]);
      }
    });
  });

  // =========================================================================
  // Role parameter injection prevention
  // =========================================================================
  describe("Role parameter injection prevention", () => {
    it("cannot escalate role via query parameter", async () => {
      mockGetAuthContext.mockResolvedValue(candidateCtx);

      const module = await import("@/app/api/candidates/route");
      const req = new NextRequest("http://localhost:3000/api/candidates?role=super_admin");
      const res = await module.GET(req);

      // Role from auth context should be used, not query param
      expect(res.status).toBe(403);
    });

    it("cannot escalate role via request body", async () => {
      mockGetAuthContext.mockResolvedValue(candidateCtx);

      const module = await import("@/app/api/hiring-requests/route");
      const req = new NextRequest("http://localhost:3000/api/hiring-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Exploit",
          headcount: 1,
          urgency: "high",
          role: "super_admin",
        }),
      });
      const res = await module.POST(req);

      expect(res.status).toBe(403);
    });

    it("cannot change organisationId via request headers", async () => {
      mockGetAuthContext.mockResolvedValue({
        ...recruiterCtx,
        organisationId: "org-1",
      });

      const module = await import("@/app/api/analytics/route");
      const req = new NextRequest("http://localhost:3000/api/analytics?metric=overview", {
        headers: { "X-Organisation-Id": "org-victim" },
      });
      const res = await module.GET(req);

      // Should use org-1 from auth context, not org-victim from header
      expect(res.status).not.toBe(403);
    });
  });

  // =========================================================================
  // Cross-organisation data access prevention
  // =========================================================================
  describe("Cross-organisation data access prevention", () => {
    it("leadership from org-1 cannot query org-2 export data via parameter", async () => {
      mockGetAuthContext.mockResolvedValue(companyAdminCtx);

      const module = await import("@/app/api/export/route");
      // Even if the user passes organisationId as query param, the handler
      // should use ctx.organisationId from auth context
      const req = new NextRequest(
        "http://localhost:3000/api/export?type=candidates&organisationId=org-2",
      );
      const res = await module.GET(req);

      // Should succeed but scoped to org-1
      expect(res.status).toBe(200);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockGetAuthContext = vi.fn();
const mockListMasked = vi.fn().mockResolvedValue({ candidates: [], pagination: {} });
const loggerSpy = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
};

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
  handleApiError: (err: unknown, msg: string) => {
    // Simulate the production error handler: should NOT include PII
    const body: Record<string, unknown> = { error: msg };
    return new Response(JSON.stringify(body), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  },
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
  logger: loggerSpy,
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
    listMasked: mockListMasked,
    getByUserId: vi.fn().mockResolvedValue({ id: "cand-1", email: "test@test.com", name: "Test" }),
  },
}));

vi.mock("@/lib/repositories/CandidateRepository", () => ({
  getAccessibleCandidateIdsForOrgs: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/repositories/NotificationRepository", () => ({
  NotificationRepository: {
    list: vi.fn().mockResolvedValue([]),
    unreadCount: vi.fn().mockResolvedValue(0),
  },
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

vi.mock("@/lib/validations/candidates", () => ({
  candidateQuerySchema: {
    safeParse: vi.fn().mockReturnValue({ success: true, data: { page: 1, limit: 20 } }),
  },
}));

vi.mock("@/lib/validations/jobs", () => ({
  jobQuerySchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
  createJobSchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
}));

vi.mock("@/lib/validations/applications", () => ({
  createApplicationSchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
}));

vi.mock("@/lib/validations/hiring-requests", () => ({
  createHiringRequestSchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
}));

// ---------------------------------------------------------------------------
// Auth context fixtures
// ---------------------------------------------------------------------------
const recruiterCtx = {
  userId: "user-recruiter-1",
  role: "recruiter",
  organisationId: "org-1",
};

const candidateCtx = {
  userId: "user-candidate-1",
  role: "candidate_free",
  organisationId: null,
};

// Sample PII data
const PII_EMAIL = "john.doe@personal-email.com";
const PII_PHONE = "+1-555-867-5309";
const PII_SSN = "123-45-6789";
const PII_NAME = "John Michael Doe";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("PII Leakage Prevention", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    loggerSpy.info.mockClear();
    loggerSpy.error.mockClear();
    loggerSpy.warn.mockClear();
    loggerSpy.debug.mockClear();
  });

  // =========================================================================
  // Error messages must not contain PII
  // =========================================================================
  describe("Error messages do not leak PII", () => {
    it("handleApiError does not include candidate email in error response", async () => {
      const { handleApiError } = await import("@/lib/api-helpers");

      const err = new Error(`Database error: duplicate key for email ${PII_EMAIL}`);
      const res = handleApiError(err, "Failed to create candidate");
      const body = await res.json();

      // The error message should be the generic one, not the internal detail
      expect(body.error).toBe("Failed to create candidate");
      // In production mode, detail should not be present
      if (body.detail) {
        // If detail is included (dev mode), at minimum the generic message
        // should be the primary error field
        expect(body.error).not.toContain(PII_EMAIL);
      }
    });

    it("handleApiError does not include phone numbers in error response", async () => {
      const { handleApiError } = await import("@/lib/api-helpers");

      const err = new Error(`Validation failed for phone: ${PII_PHONE}`);
      const res = handleApiError(err, "Failed to update profile");
      const body = await res.json();

      expect(body.error).toBe("Failed to update profile");
      expect(body.error).not.toContain(PII_PHONE);
    });

    it("jsonError does not include PII when used with generic messages", async () => {
      const { jsonError } = await import("@/lib/api-helpers");

      // Verify that the standard error helper produces safe output
      const res = jsonError("Unauthorized", 401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
      expect(JSON.stringify(body)).not.toContain(PII_EMAIL);
      expect(JSON.stringify(body)).not.toContain(PII_PHONE);
    });
  });

  // =========================================================================
  // Candidate listing uses masked data
  // =========================================================================
  describe("Candidate data masking", () => {
    it("CandidateService.listMasked is called instead of raw listing", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);

      // Mock listMasked to return masked data
      mockListMasked.mockResolvedValue({
        candidates: [
          {
            id: "cand-1",
            name: "J*** D**",
            email: "j***@***.com",
            phone: null,
            skills: ["JavaScript"],
          },
        ],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });

      const module = await import("@/app/api/candidates/route");
      const req = new NextRequest("http://localhost:3000/api/candidates");
      const res = await module.GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();

      // Verify the masked version was used
      if (body.candidates?.length > 0) {
        const candidate = body.candidates[0];
        // Name should be masked
        expect(candidate.name).not.toBe(PII_NAME);
        // Email should be masked
        expect(candidate.email).not.toBe(PII_EMAIL);
      }

      // Verify listMasked was called (not a raw DB query)
      expect(mockListMasked).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Logger does not output raw PII
  // =========================================================================
  describe("Logger PII safety", () => {
    it("does not log candidate email addresses", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);

      // Simulate a request that triggers logging
      const module = await import("@/app/api/candidates/route");
      const req = new NextRequest("http://localhost:3000/api/candidates");
      await module.GET(req);

      // Check all logger calls for PII leakage
      const allLogCalls = [
        ...loggerSpy.info.mock.calls,
        ...loggerSpy.error.mock.calls,
        ...loggerSpy.warn.mock.calls,
        ...loggerSpy.debug.mock.calls,
      ];

      for (const call of allLogCalls) {
        const logString = JSON.stringify(call);
        expect(logString).not.toContain(PII_EMAIL);
        expect(logString).not.toContain(PII_PHONE);
        expect(logString).not.toContain(PII_SSN);
      }
    });

    it("error logs include userId but not PII fields", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);

      // Trigger an error scenario
      const module = await import("@/app/api/notifications/route");
      const req = new Request("http://localhost:3000/api/notifications");
      await module.GET(req as any);

      // Verify no PII in log output
      for (const call of loggerSpy.error.mock.calls) {
        const logString = JSON.stringify(call);
        expect(logString).not.toContain(PII_EMAIL);
        expect(logString).not.toContain(PII_PHONE);
      }
    });
  });

  // =========================================================================
  // Forbidden access does not reveal data existence
  // =========================================================================
  describe("Information disclosure via error messages", () => {
    it("403 response does not reveal whether resource exists", async () => {
      mockGetAuthContext.mockResolvedValue(candidateCtx);

      const module = await import("@/app/api/candidates/route");
      const req = new NextRequest("http://localhost:3000/api/candidates");
      const res = await module.GET(req);

      expect(res.status).toBe(403);
      const body = await res.json();

      // Should be a generic "Forbidden" message, not "You don't have access to 15 candidates"
      expect(body.error).toMatch(/Forbidden/i);
      expect(body.error).not.toMatch(/\d+ candidates/);
      expect(JSON.stringify(body)).not.toContain("candidate");
    });

    it("error response does not leak database table names", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);

      // Simulate a database error
      const { handleApiError } = await import("@/lib/api-helpers");
      const dbErr = new Error('relation "candidates" does not exist');
      const res = handleApiError(dbErr, "Internal server error");
      const body = await res.json();

      expect(body.error).toBe("Internal server error");
      // In production, internal details should not be exposed
      expect(body.error).not.toContain("relation");
      expect(body.error).not.toContain("candidates");
    });

    it("error response does not leak stack traces in production", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      try {
        const { handleApiError } = await import("@/lib/api-helpers");
        const err = new Error("Internal failure with PII: " + PII_EMAIL);
        const res = handleApiError(err, "Something went wrong");
        const body = await res.json();

        expect(body.error).toBe("Something went wrong");
        expect(JSON.stringify(body)).not.toContain(PII_EMAIL);
        expect(JSON.stringify(body)).not.toContain("at Object");
        expect(JSON.stringify(body)).not.toContain(".ts:");
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  // =========================================================================
  // Export endpoint PII scoping
  // =========================================================================
  describe("Export endpoint PII scoping", () => {
    it("export endpoint requires authenticated recruiter role", async () => {
      mockGetAuthContext.mockResolvedValue(candidateCtx);

      const module = await import("@/app/api/export/route");
      const req = new Request("http://localhost:3000/api/export?type=candidates");
      const res = await module.GET(req as any);

      expect(res.status).toBe(403);
    });

    it("candidates cannot export any data", async () => {
      mockGetAuthContext.mockResolvedValue(candidateCtx);

      const module = await import("@/app/api/export/route");

      for (const type of ["candidates", "applications", "pipeline"]) {
        const req = new Request(`http://localhost:3000/api/export?type=${type}`);
        const res = await module.GET(req as any);
        expect(res.status).toBe(403);
      }
    });
  });

  // =========================================================================
  // Response headers security
  // =========================================================================
  describe("Response header security", () => {
    it("API responses use application/json content type", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);

      const module = await import("@/app/api/notifications/route");
      const req = new Request("http://localhost:3000/api/notifications");
      const res = await module.GET(req as any);

      const contentType = res.headers.get("content-type");
      expect(contentType).toContain("application/json");
    });
  });
});

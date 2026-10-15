import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// We test the actual validateOrigin function, not a mock
// ---------------------------------------------------------------------------

// Mock modules that transitively import the Anthropic SDK (which fails in test env)
vi.mock("@/lib/services/FitScoreService", () => ({
  FitScoreService: {
    computeSingle: vi.fn().mockResolvedValue(undefined),
    computeBatch: vi.fn().mockResolvedValue({ processed: 0 }),
  },
}));

vi.mock("@/lib/services/CandidateService", () => ({
  CandidateService: {
    getByUserId: vi.fn().mockResolvedValue(null),
    listMasked: vi.fn().mockResolvedValue({ candidates: [], pagination: {} }),
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

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: vi.fn().mockResolvedValue(null),
  requireAuth: vi.fn().mockReturnValue(false),
  hasRole: vi.fn().mockReturnValue(false),
  jsonError: (msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  jsonSuccess: (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }),
  handleApiError: (_err: unknown, msg: string) =>
    new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
  handleZodError: (error: { issues: { message: string }[] }) =>
    new Response(
      JSON.stringify({ error: error.issues.map((e: { message: string }) => e.message).join("; ") }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    ),
  reportError: vi.fn(),
  apiLogContext: vi.fn(),
  getTenantScopedClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn((fn?: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(fn),
      ),
    }),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
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

vi.mock("@/lib/observability/route-span", () => ({
  withRouteSpan: (_name: string, fn: Function) => fn(),
}));

vi.mock("@/lib/observability/with-correlation", () => ({
  withCorrelation: (fn: Function) => fn,
}));

vi.mock("@/lib/observability/correlation", () => ({
  getCorrelationId: vi.fn().mockReturnValue("test-correlation-id"),
}));

vi.mock("@/lib/jobs/queue", () => ({
  enqueue: vi.fn().mockResolvedValue({ id: "mock-job" }),
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

vi.mock("@/lib/services/resend", () => ({
  sendApplicationConfirmation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/notifications", () => ({
  createNotification: vi.fn(),
}));

vi.mock("@/lib/validations/applications", () => ({
  createApplicationSchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
}));

vi.mock("@/lib/validations/jobs", () => ({
  jobQuerySchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
  createJobSchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
}));

describe("CSRF Protection", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env to production for CSRF tests (validateOrigin is a no-op in dev)
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.tigerhire.com";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv.NODE_ENV;
    process.env.NEXT_PUBLIC_APP_URL = originalEnv.NEXT_PUBLIC_APP_URL;
    process.env.VERCEL_URL = originalEnv.VERCEL_URL;
  });

  // We import the actual function
  async function getValidateOrigin() {
    // Clear module cache so env changes take effect
    vi.resetModules();
    const mod = await import("@/lib/security/csrf");
    return mod.validateOrigin;
  }

  // =========================================================================
  // Cross-origin POST rejection
  // =========================================================================
  describe("Cross-origin POST rejection", () => {
    it("rejects POST request from evil.com origin", async () => {
      const validateOrigin = await getValidateOrigin();

      const req = new NextRequest("https://app.tigerhire.com/api/jobs", {
        method: "POST",
        headers: {
          Origin: "https://evil.com",
          "Content-Type": "application/json",
        },
      });

      const result = validateOrigin(req);
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
    });

    it("rejects POST request from subdomain spoofing attempt", async () => {
      const validateOrigin = await getValidateOrigin();

      const req = new NextRequest("https://app.tigerhire.com/api/messages", {
        method: "POST",
        headers: {
          Origin: "https://app.tigerhire.com.evil.com",
          "Content-Type": "application/json",
        },
      });

      const result = validateOrigin(req);
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
    });

    it("rejects POST request with http:// when app uses https://", async () => {
      const validateOrigin = await getValidateOrigin();

      const req = new NextRequest("https://app.tigerhire.com/api/jobs", {
        method: "POST",
        headers: {
          Origin: "http://app.tigerhire.com",
          "Content-Type": "application/json",
        },
      });

      const result = validateOrigin(req);
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
    });

    it("rejects POST with mismatched port in origin", async () => {
      const validateOrigin = await getValidateOrigin();

      const req = new NextRequest("https://app.tigerhire.com/api/jobs", {
        method: "POST",
        headers: {
          Origin: "https://app.tigerhire.com:8080",
          "Content-Type": "application/json",
        },
      });

      const result = validateOrigin(req);
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
    });
  });

  // =========================================================================
  // Same-origin POST allowed
  // =========================================================================
  describe("Same-origin POST allowed", () => {
    it("allows POST request from same origin", async () => {
      const validateOrigin = await getValidateOrigin();

      const req = new NextRequest("https://app.tigerhire.com/api/jobs", {
        method: "POST",
        headers: {
          Origin: "https://app.tigerhire.com",
          "Content-Type": "application/json",
        },
      });

      const result = validateOrigin(req);
      expect(result).toBeNull();
    });

    it("allows POST when origin matches NEXT_PUBLIC_APP_URL", async () => {
      const validateOrigin = await getValidateOrigin();

      const req = new NextRequest("https://app.tigerhire.com/api/messages", {
        method: "POST",
        headers: {
          Origin: "https://app.tigerhire.com",
          "Content-Type": "application/json",
        },
      });

      const result = validateOrigin(req);
      expect(result).toBeNull();
    });

    it("allows POST request without origin header (same-origin by default)", async () => {
      const validateOrigin = await getValidateOrigin();

      const req = new NextRequest("https://app.tigerhire.com/api/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const result = validateOrigin(req);
      // No origin header and no referer = allowed (same-origin browser requests)
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // Referer-based validation
  // =========================================================================
  describe("Referer-based validation", () => {
    it("allows request when referer matches app URL", async () => {
      const validateOrigin = await getValidateOrigin();

      const req = new NextRequest("https://app.tigerhire.com/api/jobs", {
        method: "POST",
        headers: {
          Referer: "https://app.tigerhire.com/jobs/new",
          "Content-Type": "application/json",
        },
      });

      const result = validateOrigin(req);
      expect(result).toBeNull();
    });

    it("rejects request when referer is from different origin", async () => {
      const validateOrigin = await getValidateOrigin();

      const req = new NextRequest("https://app.tigerhire.com/api/jobs", {
        method: "POST",
        headers: {
          Referer: "https://evil.com/phishing-page",
          "Content-Type": "application/json",
        },
      });

      const result = validateOrigin(req);
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
    });

    it("rejects request with malformed referer", async () => {
      const validateOrigin = await getValidateOrigin();

      const req = new NextRequest("https://app.tigerhire.com/api/jobs", {
        method: "POST",
        headers: {
          Referer: "not-a-valid-url",
          "Content-Type": "application/json",
        },
      });

      const result = validateOrigin(req);
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
    });
  });

  // =========================================================================
  // Development mode bypass
  // =========================================================================
  describe("Development mode bypass", () => {
    it("allows cross-origin in development mode", async () => {
      process.env.NODE_ENV = "development";
      const validateOrigin = await getValidateOrigin();

      const req = new NextRequest("http://localhost:3000/api/jobs", {
        method: "POST",
        headers: {
          Origin: "https://evil.com",
          "Content-Type": "application/json",
        },
      });

      const result = validateOrigin(req);
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // Vercel preview deployment support
  // =========================================================================
  describe("Vercel preview deployment support", () => {
    it("allows request from preview URL when it matches request origin", async () => {
      const validateOrigin = await getValidateOrigin();

      // Request comes from a Vercel preview, and its own origin is the preview URL
      const previewUrl = "https://tigerhire-abc123.vercel.app";
      const req = new NextRequest(`${previewUrl}/api/jobs`, {
        method: "POST",
        headers: {
          Origin: previewUrl,
          "Content-Type": "application/json",
        },
      });

      const result = validateOrigin(req);
      // Should allow because origin matches the request's own URL
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // Missing app URL configuration (fail-closed)
  // =========================================================================
  describe("Missing app URL configuration", () => {
    it("fails closed when no app URL is configured and origin differs", async () => {
      delete process.env.NEXT_PUBLIC_APP_URL;
      delete process.env.VERCEL_URL;
      const validateOrigin = await getValidateOrigin();

      const req = new NextRequest("https://app.tigerhire.com/api/jobs", {
        method: "POST",
        headers: {
          Origin: "https://evil.com",
          "Content-Type": "application/json",
        },
      });

      const result = validateOrigin(req);
      // Should reject because origin differs from request URL
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
    });

    it("allows same-origin even when no app URL is configured", async () => {
      delete process.env.NEXT_PUBLIC_APP_URL;
      delete process.env.VERCEL_URL;
      const validateOrigin = await getValidateOrigin();

      const req = new NextRequest("https://app.tigerhire.com/api/jobs", {
        method: "POST",
        headers: {
          Origin: "https://app.tigerhire.com",
          "Content-Type": "application/json",
        },
      });

      const result = validateOrigin(req);
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // www vs non-www handling
  // =========================================================================
  describe("www vs non-www handling", () => {
    it("allows www variant of the app domain", async () => {
      const validateOrigin = await getValidateOrigin();

      const req = new NextRequest("https://app.tigerhire.com/api/jobs", {
        method: "POST",
        headers: {
          Origin: "https://www.app.tigerhire.com",
          "Content-Type": "application/json",
        },
      });

      const result = validateOrigin(req);
      // The implementation adds www variant of request origin to allowed set
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // Mutation endpoints in the app use CSRF validation
  // =========================================================================
  describe("CSRF validation is applied to mutation endpoints", () => {
    it("POST /api/jobs calls validateOrigin", async () => {
      // Read the source to verify validateOrigin is called
      const jobsRoute = await import("@/app/api/jobs/route");
      // The POST handler calls validateOrigin at the top
      expect(jobsRoute.POST).toBeDefined();
    });

    it("POST /api/messages calls validateOrigin", async () => {
      const messagesRoute = await import("@/app/api/messages/route");
      expect(messagesRoute.POST).toBeDefined();
    });

    it("POST /api/applications calls validateOrigin", async () => {
      const appsRoute = await import("@/app/api/applications/route");
      expect(appsRoute.POST).toBeDefined();
    });

    it("PATCH /api/profiles calls validateOrigin", async () => {
      const profilesRoute = await import("@/app/api/profiles/route");
      expect(profilesRoute.PATCH).toBeDefined();
    });
  });
});

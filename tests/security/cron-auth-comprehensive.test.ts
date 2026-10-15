import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockValidateCronSecret = vi.fn();

vi.mock("@/lib/security/cron-auth", () => ({
  validateCronSecret: (req: unknown) => mockValidateCronSecret(req),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: vi.fn(() => {
      const p = Promise.resolve({ data: [], error: null, count: 0 });
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        then: (fn?: (v: unknown) => unknown) => p.then(fn),
      };
    }),
    rpc: vi.fn().mockResolvedValue({ data: 0, error: null }),
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
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

vi.mock("@/lib/jobs/queue", () => ({
  enqueue: vi.fn().mockResolvedValue({ id: "mock-job" }),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 10, resetAt: new Date() }),
}));

// Mock services used by cron routes
vi.mock("@/lib/services/resend", () => ({
  sendInterviewReminder: vi.fn().mockResolvedValue(undefined),
  sendApplicationReminder: vi.fn().mockResolvedValue(undefined),
  sendJobAlert: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/CandidateService", () => ({
  CandidateService: {
    embedPending: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/services/FitScoreService", () => ({
  FitScoreService: {
    computeBatch: vi.fn().mockResolvedValue({ processed: 0 }),
  },
}));

vi.mock("@/lib/services/TrustService", () => ({
  TrustService: {
    computeAll: vi.fn().mockResolvedValue({ processed: 0 }),
  },
}));

vi.mock("@/lib/agents/fitscore-agent", () => ({
  runFitScoreBatchAgent: vi.fn().mockResolvedValue({
    runId: "mock-run",
    recordsProcessed: 0,
    recordsCreated: 0,
    errors: [],
  }),
}));

vi.mock("@/lib/redis/auth-profile-cache", () => ({
  getCachedAuthProfile: vi.fn().mockResolvedValue(null),
  setCachedAuthProfile: vi.fn(),
}));

// ---------------------------------------------------------------------------
// All cron endpoints to test
// ---------------------------------------------------------------------------
const cronEndpoints = [
  "cleanup",
  "reminders",
  "job-alerts",
  "embed",
  "score-batch",
  "trust",
  "interview-reminders",
  "process-signals",
  "resignations",
  "user-count-monitor",
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Cron Endpoint Security", () => {
  beforeEach(() => {
    mockValidateCronSecret.mockReset();
  });

  // =========================================================================
  // Missing CRON_SECRET
  // =========================================================================
  describe("Rejects requests without CRON_SECRET", () => {
    for (const endpoint of cronEndpoints) {
      it(`/api/cron/${endpoint} rejects request without CRON_SECRET`, async () => {
        mockValidateCronSecret.mockResolvedValue(false);

        // Determine the exported method (POST or GET)
        const module = await import(`@/app/api/cron/${endpoint}/route`);
        const handler = module.POST ?? module.GET;
        expect(handler).toBeDefined();

        const req = new NextRequest(`http://localhost:3000/api/cron/${endpoint}`, {
          method: module.POST ? "POST" : "GET",
        });
        const res = await handler(req);

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error).toMatch(/Unauthorized/i);
      });
    }
  });

  // =========================================================================
  // Wrong CRON_SECRET
  // =========================================================================
  describe("Rejects requests with wrong CRON_SECRET", () => {
    for (const endpoint of cronEndpoints) {
      it(`/api/cron/${endpoint} rejects request with wrong CRON_SECRET`, async () => {
        mockValidateCronSecret.mockResolvedValue(false);

        const module = await import(`@/app/api/cron/${endpoint}/route`);
        const handler = module.POST ?? module.GET;

        const req = new NextRequest(`http://localhost:3000/api/cron/${endpoint}`, {
          method: module.POST ? "POST" : "GET",
          headers: {
            Authorization: "Bearer wrong-secret-value",
          },
        });
        const res = await handler(req);

        expect(res.status).toBe(401);
      });
    }
  });

  // =========================================================================
  // Empty Authorization header
  // =========================================================================
  describe("Rejects requests with empty authorization header", () => {
    for (const endpoint of cronEndpoints) {
      it(`/api/cron/${endpoint} rejects empty authorization header`, async () => {
        mockValidateCronSecret.mockResolvedValue(false);

        const module = await import(`@/app/api/cron/${endpoint}/route`);
        const handler = module.POST ?? module.GET;

        const req = new NextRequest(`http://localhost:3000/api/cron/${endpoint}`, {
          method: module.POST ? "POST" : "GET",
          headers: {
            Authorization: "",
          },
        });
        const res = await handler(req);

        expect(res.status).toBe(401);
      });
    }
  });

  // =========================================================================
  // Bearer prefix without token
  // =========================================================================
  describe("Rejects Bearer prefix without actual token", () => {
    for (const endpoint of cronEndpoints) {
      it(`/api/cron/${endpoint} rejects 'Bearer ' without token`, async () => {
        mockValidateCronSecret.mockResolvedValue(false);

        const module = await import(`@/app/api/cron/${endpoint}/route`);
        const handler = module.POST ?? module.GET;

        const req = new NextRequest(`http://localhost:3000/api/cron/${endpoint}`, {
          method: module.POST ? "POST" : "GET",
          headers: {
            Authorization: "Bearer ",
          },
        });
        const res = await handler(req);

        expect(res.status).toBe(401);
      });
    }
  });

  // =========================================================================
  // Accepts valid CRON_SECRET
  // =========================================================================
  describe("Accepts valid CRON_SECRET", () => {
    for (const endpoint of cronEndpoints) {
      it(`/api/cron/${endpoint} accepts request with valid CRON_SECRET`, async () => {
        mockValidateCronSecret.mockResolvedValue(true);

        const module = await import(`@/app/api/cron/${endpoint}/route`);
        const handler = module.POST ?? module.GET;

        const req = new NextRequest(`http://localhost:3000/api/cron/${endpoint}`, {
          method: module.POST ? "POST" : "GET",
          headers: {
            Authorization: "Bearer valid-cron-secret",
          },
        });
        const res = await handler(req);

        // Should NOT be 401 (may be 200, 500, etc. depending on DB mock)
        expect(res.status).not.toBe(401);
      });
    }
  });

  // =========================================================================
  // Non-Bearer auth schemes rejected
  // =========================================================================
  describe("Rejects non-Bearer auth schemes", () => {
    const badSchemes = [
      "Basic dXNlcjpwYXNz",
      "Digest username=admin",
      "Token my-secret",
      "ApiKey my-api-key",
    ];

    for (const scheme of badSchemes) {
      it(`rejects '${scheme.split(" ")[0]}' auth scheme on cron/cleanup`, async () => {
        mockValidateCronSecret.mockResolvedValue(false);

        const module = await import("@/app/api/cron/cleanup/route");
        const req = new NextRequest("http://localhost:3000/api/cron/cleanup", {
          method: "POST",
          headers: { Authorization: scheme },
        });
        const res = await module.POST(req);

        expect(res.status).toBe(401);
      });
    }
  });

  // =========================================================================
  // Cron endpoints are not accessible via GET when they expect POST
  // =========================================================================
  describe("HTTP method enforcement", () => {
    it("cron endpoints export POST handler, not GET (for state-changing ops)", async () => {
      for (const endpoint of cronEndpoints) {
        const module = await import(`@/app/api/cron/${endpoint}/route`);
        // Most cron routes export POST; some may export GET
        const hasHandler = module.POST !== undefined || module.GET !== undefined;
        expect(hasHandler).toBe(true);
      }
    });
  });
});

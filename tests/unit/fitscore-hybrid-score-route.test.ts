import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { recruiterCtx, fakeUuid } from "../helpers";

const mockGetAuthContext = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockIsEnabled = vi.fn();
const mockRequireOrganisationEntitlement = vi.fn();
const mockCreateSupabaseServerClient = vi.fn();
const mockCreateSupabaseAdmin = vi.fn();
const mockLoadJobForHybridPipeline = vi.fn();
const mockComputeSingle = vi.fn();
const mockGetLatestProductionScore = vi.fn();
const mockIsAnthropicDeferableError = vi.fn();
const mockMarkDeferredScore = vi.fn();
const mockPushScoringDlq = vi.fn();
const mockReportError = vi.fn();
const mockValidateOrigin = vi.fn();

class MockHybridFitScoreError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  parseJsonBody: async (request: Request) => ({ body: await request.json(), errorResponse: null }),
  jsonError: (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), { status }),
  jsonSuccess: (data: unknown, status = 200) => new Response(JSON.stringify(data), { status }),
  handleZodError: () => new Response(JSON.stringify({ error: "Invalid body" }), { status: 422 }),
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), { status: 500 }),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: (...args: unknown[]) => mockValidateOrigin(...args),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  buildScopedRateLimitKey: () => "rate-key",
}));

vi.mock("@/lib/feature-flags", () => ({
  isEnabled: (...args: unknown[]) => mockIsEnabled(...args),
}));

vi.mock("@/lib/entitlements", () => ({
  requireOrganisationEntitlement: (...args: unknown[]) =>
    mockRequireOrganisationEntitlement(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockCreateSupabaseAdmin(),
}));

vi.mock("@/lib/fitscore/hybrid/api-access", () => ({
  loadJobForHybridPipeline: (...args: unknown[]) => mockLoadJobForHybridPipeline(...args),
}));

vi.mock("@/lib/fitscore/hybrid", () => ({
  FEATURE_FLAG_HYBRID_V2: "fitscore_hybrid_v2",
  HybridFitScoreError: MockHybridFitScoreError,
}));

vi.mock("@/lib/services/anthropic-circuit", () => ({
  isAnthropicDeferableError: (...args: unknown[]) => mockIsAnthropicDeferableError(...args),
}));

vi.mock("@/lib/services/FitScoreService", () => ({
  FitScoreService: {
    computeSingle: (...args: unknown[]) => mockComputeSingle(...args),
    getLatestProductionScore: (...args: unknown[]) => mockGetLatestProductionScore(...args),
    markDeferredScore: (...args: unknown[]) => mockMarkDeferredScore(...args),
  },
}));

vi.mock("@/lib/observability/scoring-dlq", () => ({
  pushScoringDlq: (...args: unknown[]) => mockPushScoringDlq(...args),
}));

vi.mock("@/lib/observability/report-error", () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

vi.mock("@/lib/observability/sentry", () => ({
  addSentryBreadcrumb: vi.fn(),
  setSentryRequestContext: vi.fn(),
}));

describe("POST /api/fitscore/score", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateOrigin.mockReturnValue(null);
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockIsEnabled.mockResolvedValue(true);
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockRequireOrganisationEntitlement.mockResolvedValue({ ok: true });
    mockLoadJobForHybridPipeline.mockResolvedValue({ id: "job-1", title: "Engineer" });
    mockCreateSupabaseServerClient.mockResolvedValue({});
    mockCreateSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: fakeUuid("1"), name: "Candidate" },
          error: null,
        }),
      }),
    });
    mockComputeSingle.mockResolvedValue({
      fitScore: 81,
      fitLabel: "Strong Match",
      fitLabelColor: "green",
      extraction: {},
      explanation: "Good fit",
      evidence: [],
      breakdown: {},
      confidence: { band: "high", score: 0.9 },
      market: { percentile: 70 },
      idealMatch: 85,
      verdict: {
        label: "Proceed",
        icon: "check",
        color: "green",
        bg: "green",
        action: "shortlist",
      },
      shadowScore: 79,
    });
    mockIsAnthropicDeferableError.mockReturnValue(false);
  });

  function buildReq() {
    return new NextRequest("http://localhost/api/fitscore/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: fakeUuid("100"), candidateId: fakeUuid("1") }),
    });
  }

  it("returns 403 when hybrid feature flag is disabled", async () => {
    mockIsEnabled.mockResolvedValue(false);
    const { POST } = await import("@/app/api/fitscore/score/route");
    const res = await POST(buildReq());
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate limit is exceeded", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false });
    const { POST } = await import("@/app/api/fitscore/score/route");
    const res = await POST(buildReq());
    expect(res.status).toBe(429);
  });

  it("returns 202 and marks deferred when Anthropic is deferable", async () => {
    mockComputeSingle.mockRejectedValue(new Error("anthropic unavailable"));
    mockIsAnthropicDeferableError.mockReturnValue(true);
    const { POST } = await import("@/app/api/fitscore/score/route");
    const res = await POST(buildReq());
    expect(res.status).toBe(202);
    expect(mockMarkDeferredScore).toHaveBeenCalled();
  });

  it("returns 428 for jd_base_not_approved errors", async () => {
    mockComputeSingle.mockRejectedValue(
      new MockHybridFitScoreError("Awaiting approval", "jd_base_not_approved"),
    );
    const { POST } = await import("@/app/api/fitscore/score/route");
    const res = await POST(buildReq());
    expect(res.status).toBe(428);
  });

  it("returns 201 with hybrid score payload on success", async () => {
    const { POST } = await import("@/app/api/fitscore/score/route");
    const res = await POST(buildReq());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.fitScore).toBe(81);
    expect(body.verdict.label).toBe("Proceed");
  });
});

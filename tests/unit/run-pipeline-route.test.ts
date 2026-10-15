import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { recruiterCtx, candidateCtx, companyAdminCtx, agencyCtx, fakeUuid } from "../helpers";

const mockGetAuthContext = vi.fn();
const mockMaybeSingle = vi.fn();
const mockGetTenantScopedClient = vi.fn(() =>
  Promise.resolve({
    jobs: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mockMaybeSingle,
        }),
      }),
    }),
  }),
);

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  getTenantScopedClient: (...args: unknown[]) => mockGetTenantScopedClient(...args),
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
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("@/lib/security/csrf", () => ({ validateOrigin: () => null }));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 99, resetAt: new Date() })),
  buildScopedRateLimitKey: (args: { route: string }) => `rl:${args.route}`,
}));

const mockRunPipelineForJob = vi.fn();
vi.mock("@/lib/agents/run-pipeline", () => ({
  runPipelineForJob: (...args: unknown[]) => mockRunPipelineForJob(...args),
}));

const mockRequireOrganisationEntitlement = vi.fn();
vi.mock("@/lib/entitlements", () => ({
  requireOrganisationEntitlement: (...args: unknown[]) =>
    mockRequireOrganisationEntitlement(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe("POST /api/agents/run-pipeline", () => {
  const jobId = fakeUuid("0001");

  beforeEach(() => {
    vi.resetModules();
    mockGetAuthContext.mockReset();
    mockMaybeSingle.mockReset();
    mockRunPipelineForJob.mockReset();
    mockRequireOrganisationEntitlement.mockReset();
    mockRequireOrganisationEntitlement.mockResolvedValue({ ok: true });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/agents/run-pipeline/route");
    const req = new NextRequest("http://localhost/api/agents/run-pipeline", {
      method: "POST",
      body: JSON.stringify({ jobId }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { POST } = await import("@/app/api/agents/run-pipeline/route");
    const req = new NextRequest("http://localhost/api/agents/run-pipeline", {
      method: "POST",
      body: JSON.stringify({ jobId }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 404 when job is not in tenant scope", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const { POST } = await import("@/app/api/agents/run-pipeline/route");
    const req = new NextRequest("http://localhost/api/agents/run-pipeline", {
      method: "POST",
      body: JSON.stringify({ jobId }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("returns 403 when organisation is not entitled", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    mockMaybeSingle.mockResolvedValue({
      data: { id: jobId, organisation_id: "org-1" },
      error: null,
    });
    mockRequireOrganisationEntitlement.mockResolvedValue({
      ok: false,
      message: "plan limit",
    });
    const { POST } = await import("@/app/api/agents/run-pipeline/route");
    const req = new NextRequest("http://localhost/api/agents/run-pipeline", {
      method: "POST",
      body: JSON.stringify({ jobId }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/not entitled/i);
  });

  it("returns 200 and pipeline payload for agency when entitled", async () => {
    mockGetAuthContext.mockResolvedValue(agencyCtx);
    mockMaybeSingle.mockResolvedValue({
      data: { id: jobId, organisation_id: "org-agency-1" },
      error: null,
    });
    mockRunPipelineForJob.mockResolvedValue({
      jobId,
      candidatesProcessed: 2,
      approved: 1,
      rejected: 0,
      belowThreshold: 1,
      errors: [],
      candidatePool: { pipeline: 2, applications: 0, fitScores: 0, selected: 2 },
    });
    const { POST } = await import("@/app/api/agents/run-pipeline/route");
    const req = new NextRequest("http://localhost/api/agents/run-pipeline", {
      method: "POST",
      body: JSON.stringify({ jobId, maxCandidates: 5 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidatesProcessed).toBe(2);
    expect(mockRunPipelineForJob).toHaveBeenCalledWith(jobId, {
      maxCandidates: 5,
      forceRescore: undefined,
    });
  });
});

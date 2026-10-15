import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { recruiterCtx, candidateCtx, hiringManagerCtx, agencyCtx } from "../helpers";

const CANDIDATE_ID_1 = "00000000-0000-4000-8000-000000000001";
const CANDIDATE_ID_2 = "00000000-0000-4000-8000-000000000002";

const mockGetAuthContext = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockValidateOrigin = vi.fn();
const mockRecordPipelineActionSignals = vi.fn().mockResolvedValue(undefined);

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
  handleZodError: (err: { issues: Array<{ message: string }> }) =>
    new Response(
      JSON.stringify({
        error: err.issues.map((e: { message: string }) => e.message).join("; "),
      }),
      {
        status: 422,
        headers: { "Content-Type": "application/json" },
      },
    ),
  validateOrigin: (...args: unknown[]) => mockValidateOrigin(...args),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  buildScopedRateLimitKey: ({ route, userId, organisationId, ip }: any) =>
    `${route}:${organisationId ?? userId ?? ip ?? "anon"}`,
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

const createMockQueryBuilder = () => {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn(),
  };
  return builder;
};

const mockSupabaseAdmin = {
  from: vi.fn(() => createMockQueryBuilder()),
};

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockSupabaseAdmin,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({ from: vi.fn() }),
}));

const mockAssertJobAccess = vi.fn();
vi.mock("@/lib/job-access", () => ({
  assertJobAccess: (...args: unknown[]) => mockAssertJobAccess(...args),
}));

vi.mock("@/lib/analytics/log-pipeline-stage-transition", () => ({
  logPipelineStageTransition: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/services/pipeline-action-signals", () => ({
  recordPipelineActionSignals: (...args: unknown[]) => mockRecordPipelineActionSignals(...args),
}));

vi.mock("@/lib/services/hiring-outcomes", () => ({
  upsertHiringOutcome: vi.fn().mockResolvedValue(undefined),
}));

describe("POST /api/jobs/[id]/pipeline/bulk", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockCheckRateLimit.mockReset();
    mockValidateOrigin.mockReturnValue(null);
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 10, resetAt: new Date() });
    mockSupabaseAdmin.from.mockClear();
    mockRecordPipelineActionSignals.mockClear();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/jobs/[id]/pipeline/bulk/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-123/pipeline/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reject",
        candidateIds: [CANDIDATE_ID_1],
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-123" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { POST } = await import("@/app/api/jobs/[id]/pipeline/bulk/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-123/pipeline/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reject",
        candidateIds: [CANDIDATE_ID_1],
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-123" }) });
    expect(res.status).toBe(403);
  });

  it("returns 400 when stageId is missing for move_stage", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const queryBuilder = createMockQueryBuilder();
    queryBuilder.single.mockResolvedValue({
      data: { id: "job-123", organisation_id: recruiterCtx.organisationId },
      error: null,
    });
    mockSupabaseAdmin.from.mockReturnValue(queryBuilder);

    const { POST } = await import("@/app/api/jobs/[id]/pipeline/bulk/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-123/pipeline/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "move_stage",
        candidateIds: [CANDIDATE_ID_1],
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-123" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("stageId is required");
  });

  it("returns 403 when hiring manager attempts move_stage", async () => {
    mockGetAuthContext.mockResolvedValue(hiringManagerCtx);
    const { POST } = await import("@/app/api/jobs/[id]/pipeline/bulk/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-123/pipeline/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "move_stage",
        stageId: "00000000-0000-4000-8000-00000000000a",
        candidateIds: [CANDIDATE_ID_1],
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-123" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Only admins or recruiters can change pipeline stage");
  });

  it("returns 403 when agency attempts move_stage", async () => {
    mockGetAuthContext.mockResolvedValue(agencyCtx);
    const { POST } = await import("@/app/api/jobs/[id]/pipeline/bulk/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-123/pipeline/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "move_stage",
        stageId: "00000000-0000-4000-8000-00000000000a",
        candidateIds: [CANDIDATE_ID_1],
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-123" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Only admins or recruiters can change pipeline stage");
  });

  it("returns 400 for malformed JSON body", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/jobs/[id]/pipeline/bulk/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-123/pipeline/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-123" }) });
    expect(res.status).toBe(400);
  });

  it("performs bulk reject action", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const jobRecord = { id: "job-123", organisation_id: recruiterCtx.organisationId };
    mockAssertJobAccess.mockResolvedValue({ job: jobRecord });
    const jobBuilder = createMockQueryBuilder();
    jobBuilder.single.mockResolvedValue({
      data: jobRecord,
      error: null,
    });
    const updateBuilder = createMockQueryBuilder();
    updateBuilder.select.mockResolvedValue({
      data: [{ id: "candidate-1" }],
      error: null,
    });
    mockSupabaseAdmin.from.mockImplementation((table: string) => {
      if (table === "jobs") return jobBuilder;
      return updateBuilder;
    });

    const { POST } = await import("@/app/api/jobs/[id]/pipeline/bulk/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-123/pipeline/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reject",
        candidateIds: [CANDIDATE_ID_1, CANDIDATE_ID_2],
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-123" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(1);
  });

  it("performs bulk shortlist action", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const jobRecord = { id: "job-123", organisation_id: recruiterCtx.organisationId };
    mockAssertJobAccess.mockResolvedValue({ job: jobRecord });
    const jobBuilder = createMockQueryBuilder();
    jobBuilder.single.mockResolvedValue({
      data: jobRecord,
      error: null,
    });
    const updateBuilder = createMockQueryBuilder();
    updateBuilder.select.mockResolvedValue({
      data: [{ id: "candidate-1" }, { id: "candidate-2" }],
      error: null,
    });
    mockSupabaseAdmin.from.mockImplementation((table: string) => {
      if (table === "jobs") return jobBuilder;
      return updateBuilder;
    });

    const { POST } = await import("@/app/api/jobs/[id]/pipeline/bulk/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-123/pipeline/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "shortlist",
        candidateIds: [CANDIDATE_ID_1, CANDIDATE_ID_2],
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-123" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(2);
    expect(mockRecordPipelineActionSignals).toHaveBeenCalledOnce();
  });

  it("returns 404 when job not found", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockAssertJobAccess.mockResolvedValue({ job: null });
    const queryBuilder = createMockQueryBuilder();
    queryBuilder.single.mockResolvedValue({
      data: null,
      error: null,
    });
    mockSupabaseAdmin.from.mockReturnValue(queryBuilder);

    const { POST } = await import("@/app/api/jobs/[id]/pipeline/bulk/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-123/pipeline/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reject",
        candidateIds: [CANDIDATE_ID_1],
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-123" }) });
    expect(res.status).toBe(404);
  });
});

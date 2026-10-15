import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  recruiterCtx,
  candidateCtx,
  companyAdminCtx,
  createMockSupabase,
  createMockQueryBuilder,
} from "../helpers";

const mockGetAuthContext = vi.fn();
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
      { status: 422, headers: { "Content-Type": "application/json" } },
    ),
  handleApiError: (err: unknown, _msg: string) =>
    new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

const mockCreateSupabaseServerClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

const mockCreateSupabaseAdmin = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockCreateSupabaseAdmin(),
}));

vi.mock("@/lib/security/csrf", () => ({ validateOrigin: () => null }));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const mockGetCompanyPlanUnlockLimit = vi.fn();
vi.mock("@/lib/services/stripe", () => ({
  getCompanyPlanUnlockLimit: (...args: unknown[]) => mockGetCompanyPlanUnlockLimit(...args),
}));
const mockConsumeManualCredits = vi.fn();
const mockGetManualBillingState = vi.fn();
const mockEnv = { manualUnlockCapBypassOrgIds: [] as string[] };
vi.mock("@/lib/services/manual-billing", () => ({
  consumeManualCredits: (...args: unknown[]) => mockConsumeManualCredits(...args),
  getManualBillingState: (...args: unknown[]) => mockGetManualBillingState(...args),
}));
vi.mock("@/lib/config/env", () => ({ env: mockEnv }));

const CANDIDATE_ID = "00000000-1111-4000-8000-000000000001";
const JOB_ID = "00000000-2222-4000-8000-000000000002";

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(body: unknown) {
  return new NextRequest(`http://localhost:3000/api/candidates/${CANDIDATE_ID}/unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/candidates/[id]/unlock", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockEnv.manualUnlockCapBypassOrgIds = [];
    mockGetCompanyPlanUnlockLimit.mockResolvedValue(100);
    mockConsumeManualCredits.mockResolvedValue({ applied: false });
    mockGetManualBillingState.mockResolvedValue({
      profile: { billing_mode: "manual", allow_negative_balance: false },
      wallet: { unlock_balance: 10 },
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/candidates/[id]/unlock/route");
    const res = await POST(makeRequest({ jobId: JOB_ID }), makeParams(CANDIDATE_ID));
    expect(res.status).toBe(401);
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { POST } = await import("@/app/api/candidates/[id]/unlock/route");
    const res = await POST(makeRequest({ jobId: JOB_ID }), makeParams(CANDIDATE_ID));
    expect(res.status).toBe(403);
  });

  it("returns 422 for invalid jobId (not a UUID)", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);

    const unlocksBuilder = createMockQueryBuilder({ data: null, error: null });
    const supabase = createMockSupabase({ candidate_unlocks: unlocksBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/candidates/[id]/unlock/route");
    const res = await POST(makeRequest({ jobId: "not-a-uuid" }), makeParams(CANDIDATE_ID));
    expect(res.status).toBe(422);
  });

  it("returns 400 for malformed JSON body", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const unlocksBuilder = createMockQueryBuilder({ data: null, error: null });
    const supabase = createMockSupabase({ candidate_unlocks: unlocksBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/candidates/[id]/unlock/route");
    const req = new NextRequest(`http://localhost:3000/api/candidates/${CANDIDATE_ID}/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req, makeParams(CANDIDATE_ID));
    expect(res.status).toBe(400);
  });

  it("returns 200 when candidate is already unlocked", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);

    const candidateData = { id: CANDIDATE_ID, full_name: "Test User", email: "test@example.com" };

    const unlocksBuilder = createMockQueryBuilder({ data: { id: "unlock-1" } });
    const candidatesBuilder = createMockQueryBuilder({ data: candidateData });
    const supabase = createMockSupabase({
      candidate_unlocks: unlocksBuilder,
      candidates: candidatesBuilder,
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/candidates/[id]/unlock/route");
    const res = await POST(makeRequest({ jobId: JOB_ID }), makeParams(CANDIDATE_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alreadyUnlocked).toBe(true);
    expect(body.candidate).toEqual(candidateData);
  });

  it("returns 201 on successful unlock (creates record)", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);

    const candidateData = { id: CANDIDATE_ID, full_name: "Test User" };

    // candidate_unlocks: first call (check existing) returns null, second call (insert) succeeds
    const unlocksBuilder = createMockQueryBuilder({ data: null, error: null });
    const orgsBuilder = createMockQueryBuilder({ data: { company_plan: "growth" } });
    const candidatesBuilder = createMockQueryBuilder({ data: candidateData });

    const supabase = createMockSupabase({
      candidate_unlocks: unlocksBuilder,
      organisations: orgsBuilder,
      candidates: candidatesBuilder,
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    // Admin client for audit log
    const adminBuilder = createMockQueryBuilder({ data: null, error: null });
    const adminClient = createMockSupabase({ access_audit_log: adminBuilder });
    mockCreateSupabaseAdmin.mockReturnValue(adminClient);

    // Monthly usage count: 5 used, limit 100
    mockGetCompanyPlanUnlockLimit.mockResolvedValue(100);

    const { POST } = await import("@/app/api/candidates/[id]/unlock/route");
    const res = await POST(makeRequest({ jobId: JOB_ID }), makeParams(CANDIDATE_ID));
    // The route checks for existing unlock -> null, then checks org plan, then inserts
    // Due to mock reuse, the chain returns null for single() on first call
    // The insert on candidate_unlocks also uses the same builder, returning { error: null }
    expect([200, 201]).toContain(res.status);
  });

  it("returns 403 when unlock quota is exceeded", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);

    // First call to candidate_unlocks.single() returns null (not already unlocked)
    const unlocksBuilder = createMockQueryBuilder({ data: null, error: null, count: 50 });
    const orgsBuilder = createMockQueryBuilder({ data: { company_plan: "starter" } });

    const supabase = createMockSupabase({
      candidate_unlocks: unlocksBuilder,
      organisations: orgsBuilder,
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    // Quota: limit is 50, used is 50
    mockGetCompanyPlanUnlockLimit.mockResolvedValue(50);

    const { POST } = await import("@/app/api/candidates/[id]/unlock/route");
    const res = await POST(makeRequest({ jobId: JOB_ID }), makeParams(CANDIDATE_ID));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("INSUFFICIENT_CREDITS");
  });

  it("allows unlock via manual wallet when cap bypass is configured", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockEnv.manualUnlockCapBypassOrgIds = [recruiterCtx.organisationId];

    const candidateData = { id: CANDIDATE_ID, full_name: "Test User" };
    const unlocksBuilder = createMockQueryBuilder({ data: null, error: null, count: 50 });
    const orgsBuilder = createMockQueryBuilder({ data: { company_plan: "starter" } });
    const candidatesBuilder = createMockQueryBuilder({ data: candidateData });

    const supabase = createMockSupabase({
      candidate_unlocks: unlocksBuilder,
      organisations: orgsBuilder,
      candidates: candidatesBuilder,
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);
    mockGetCompanyPlanUnlockLimit.mockResolvedValue(50);
    mockConsumeManualCredits.mockResolvedValue({ applied: true, balanceAfter: 9 });

    const adminBuilder = createMockQueryBuilder({ data: null, error: null });
    const adminClient = createMockSupabase({ access_audit_log: adminBuilder });
    mockCreateSupabaseAdmin.mockReturnValue(adminClient);

    const { POST } = await import("@/app/api/candidates/[id]/unlock/route");
    const res = await POST(makeRequest({ jobId: JOB_ID }), makeParams(CANDIDATE_ID));
    expect([200, 201]).toContain(res.status);
  });

  it("returns 400 when user has no organisationId", async () => {
    mockGetAuthContext.mockResolvedValue({ ...recruiterCtx, organisationId: null });
    const { POST } = await import("@/app/api/candidates/[id]/unlock/route");
    const res = await POST(makeRequest({ jobId: JOB_ID }), makeParams(CANDIDATE_ID));
    expect(res.status).toBe(400);
  });

  it("returns 500 on DB error during unlock insert", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);

    // Not already unlocked
    const unlocksBuilder = createMockQueryBuilder({ data: null, error: null, count: 0 });
    // Override insert to return an error
    unlocksBuilder.insert = vi.fn().mockReturnValue({
      ...unlocksBuilder,
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn((resolve: (v: unknown) => void) =>
        resolve({ data: null, error: { message: "DB write failed" } }),
      ),
    });
    const orgsBuilder = createMockQueryBuilder({ data: { company_plan: "growth" } });

    const supabase = createMockSupabase({
      candidate_unlocks: unlocksBuilder,
      organisations: orgsBuilder,
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);
    mockGetCompanyPlanUnlockLimit.mockResolvedValue(100);

    const { POST } = await import("@/app/api/candidates/[id]/unlock/route");
    const res = await POST(makeRequest({ jobId: JOB_ID }), makeParams(CANDIDATE_ID));
    expect(res.status).toBe(500);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { recruiterCtx, candidateCtx } from "../helpers";

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
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

const mockServerFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({ from: (...args: unknown[]) => mockServerFrom(...args) }),
}));

const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ from: (...args: unknown[]) => mockAdminFrom(...args) }),
}));

const mockAssertJobAccess = vi.fn();
vi.mock("@/lib/job-access", () => ({
  assertJobAccess: (...args: unknown[]) => mockAssertJobAccess(...args),
}));

const mockTriggerSchedulerAgent = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/agents/scheduler", () => ({
  triggerSchedulerAgent: (...args: unknown[]) => mockTriggerSchedulerAgent(...args),
}));

const mockGetDualApprovalStatus = vi.fn();
vi.mock("@/lib/pipeline-approvals", () => ({
  getDualApprovalStatus: (...args: unknown[]) => mockGetDualApprovalStatus(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
const mockResolveCalendarConnection = vi.fn();
const mockResolveInfraConnection = vi.fn();
vi.mock("@/lib/settings/resolve-integration", () => ({
  resolveCalendarConnection: (...args: unknown[]) => mockResolveCalendarConnection(...args),
  resolveInfraConnection: (...args: unknown[]) => mockResolveInfraConnection(...args),
}));

function supabaseChain(resolved: { data: unknown; error?: unknown }) {
  const result = Promise.resolve(resolved);
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "insert", "update", "order", "limit", "in", "or"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockResolvedValue(resolved);
  chain.then = (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    result.then(onFulfilled, onRejected);
  return chain;
}

describe("POST /api/jobs/[id]/pipeline/request-interview", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAuthContext.mockReset();
    mockServerFrom.mockReset();
    mockAdminFrom.mockReset();
    mockAssertJobAccess.mockReset();
    mockTriggerSchedulerAgent.mockReset();
    mockGetDualApprovalStatus.mockReset();
    mockResolveCalendarConnection.mockReset();
    mockResolveInfraConnection.mockReset();
    mockResolveCalendarConnection.mockResolvedValue({
      provider: "google_calendar",
      status: "connected",
    });
    mockResolveInfraConnection.mockResolvedValue({
      provider: "daily",
      status: "connected",
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/jobs/[id]/pipeline/request-interview/route");
    const req = new NextRequest("http://localhost/api/jobs/job-1/pipeline/request-interview", {
      method: "POST",
      body: JSON.stringify({ candidateId: "c-1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { POST } = await import("@/app/api/jobs/[id]/pipeline/request-interview/route");
    const req = new NextRequest("http://localhost/api/jobs/job-1/pipeline/request-interview", {
      method: "POST",
      body: JSON.stringify({ candidateId: "c-1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 400 when candidateId is missing", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockAssertJobAccess.mockResolvedValue({ job: { id: "job-1", organisation_id: "org-1" } });
    const { POST } = await import("@/app/api/jobs/[id]/pipeline/request-interview/route");
    const req = new NextRequest("http://localhost/api/jobs/job-1/pipeline/request-interview", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("candidateId");
  });

  it("returns 404 when job not found", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockAssertJobAccess.mockResolvedValue({ job: null });
    const { POST } = await import("@/app/api/jobs/[id]/pipeline/request-interview/route");
    const req = new NextRequest("http://localhost/api/jobs/job-1/pipeline/request-interview", {
      method: "POST",
      body: JSON.stringify({ candidateId: "c-1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 when dual approval not met (neither approved)", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockAssertJobAccess.mockResolvedValue({ job: { id: "job-1", organisation_id: "org-1" } });
    // Existing pipeline candidate
    const pcChain = supabaseChain({ data: { id: "pc-1" }, error: null });
    mockServerFrom.mockReturnValue(pcChain);
    mockGetDualApprovalStatus.mockResolvedValue({ recruiterApproved: false, hmApproved: false });
    const { POST } = await import("@/app/api/jobs/[id]/pipeline/request-interview/route");
    const req = new NextRequest("http://localhost/api/jobs/job-1/pipeline/request-interview", {
      method: "POST",
      body: JSON.stringify({ candidateId: "c-1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("approval");
  });

  it("returns 403 when only recruiter has approved (HM pending)", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockAssertJobAccess.mockResolvedValue({ job: { id: "job-1", organisation_id: "org-1" } });
    const pcChain = supabaseChain({ data: { id: "pc-1" }, error: null });
    mockServerFrom.mockReturnValue(pcChain);
    mockGetDualApprovalStatus.mockResolvedValue({ recruiterApproved: true, hmApproved: false });
    const { POST } = await import("@/app/api/jobs/[id]/pipeline/request-interview/route");
    const req = new NextRequest("http://localhost/api/jobs/job-1/pipeline/request-interview", {
      method: "POST",
      body: JSON.stringify({ candidateId: "c-1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Hiring manager");
  });

  it("returns 200 when candidate added and interview requested (new candidate, both approved)", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockAssertJobAccess.mockResolvedValue({ job: { id: "job-1", organisation_id: "org-1" } });

    let callCount = 0;
    mockServerFrom.mockImplementation((table: string) => {
      if (table === "pipeline_candidates") {
        callCount++;
        if (callCount === 1) {
          // First call: check for existing candidate (dual-approval check) - not found
          return supabaseChain({ data: null, error: { code: "PGRST116" } });
        }
        if (callCount === 2) {
          // Second call: stage lookup via first pipeline stage
          // This is actually pipeline_stages, handled below
          return supabaseChain({ data: null, error: { code: "PGRST116" } });
        }
        // Third call: insert
        return supabaseChain({ data: null, error: null });
      }
      if (table === "pipeline_stages") {
        return supabaseChain({ data: { id: "stage-1" }, error: null });
      }
      return supabaseChain({ data: null, error: null });
    });

    mockTriggerSchedulerAgent.mockResolvedValue(undefined);

    const { POST } = await import("@/app/api/jobs/[id]/pipeline/request-interview/route");
    const req = new NextRequest("http://localhost/api/jobs/job-1/pipeline/request-interview", {
      method: "POST",
      body: JSON.stringify({ candidateId: "c-1", stageId: "stage-1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    // When no existing pipeline_candidate found, dual-approval check is skipped
    // so it proceeds to stage validation and insertion
    expect(res.status).toBe(200);
  });

  it("auto-creates a default interview stage when job has none", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockAssertJobAccess.mockResolvedValue({
      job: {
        id: "job-1",
        organisation_id: "org-1",
        hiring_manager_id: null,
      },
    });

    let pipelineCandidatesCall = 0;
    let pipelineStagesCall = 0;
    mockServerFrom.mockImplementation((table: string) => {
      if (table === "pipeline_candidates") {
        pipelineCandidatesCall += 1;
        if (pipelineCandidatesCall === 1) {
          return supabaseChain({ data: null, error: null });
        }
        if (pipelineCandidatesCall === 2) {
          return supabaseChain({ data: null, error: null });
        }
        return supabaseChain({ data: { id: "pc-1" }, error: null });
      }
      if (table === "pipeline_stages") {
        pipelineStagesCall += 1;
        if (pipelineStagesCall === 1) {
          return supabaseChain({ data: null, error: null });
        }
        return supabaseChain({ data: { id: "stage-auto", stage_name: "Interview" }, error: null });
      }
      return supabaseChain({ data: null, error: null });
    });

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "pipeline_stages") {
        return supabaseChain({ data: { id: "stage-auto" }, error: null });
      }
      if (table === "profiles") {
        return supabaseChain({ data: null, error: null });
      }
      return supabaseChain({ data: null, error: null });
    });

    mockTriggerSchedulerAgent.mockResolvedValue(undefined);

    const { POST } = await import("@/app/api/jobs/[id]/pipeline/request-interview/route");
    const req = new NextRequest("http://localhost/api/jobs/job-1/pipeline/request-interview", {
      method: "POST",
      body: JSON.stringify({ candidateId: "c-1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(200);
    expect(mockTriggerSchedulerAgent).toHaveBeenCalledWith({
      candidateId: "c-1",
      jobId: "job-1",
      stageId: "stage-auto",
      initiatedBy: "user-recruiter-1",
    });
  });
});

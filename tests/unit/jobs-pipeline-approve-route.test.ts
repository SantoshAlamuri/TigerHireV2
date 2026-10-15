import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { recruiterCtx, candidateCtx, hiringManagerCtx } from "../helpers";

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

const mockCreateNotification = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/services/notifications", () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
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

function supabaseChain(resolved: { data: unknown; error?: unknown }) {
  const result = Promise.resolve(resolved);
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "insert", "update", "order", "limit", "in", "or", "neq"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockResolvedValue(resolved);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolved);
  chain.then = (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    result.then(onFulfilled, onRejected);
  return chain;
}

describe("GET /api/jobs/[id]/pipeline/approve", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAuthContext.mockReset();
    mockServerFrom.mockReset();
    mockAdminFrom.mockReset();
    mockAssertJobAccess.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/jobs/[id]/pipeline/approve/route");
    const req = new NextRequest("http://localhost/api/jobs/job-1/pipeline/approve");
    const res = await GET(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when job not found", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockAssertJobAccess.mockResolvedValue({ job: null });
    const { GET } = await import("@/app/api/jobs/[id]/pipeline/approve/route");
    const req = new NextRequest("http://localhost/api/jobs/job-1/pipeline/approve");
    const res = await GET(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(404);
  });

  it("returns 200 with candidates and approvals", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockAssertJobAccess.mockResolvedValue({
      job: { id: "job-1", organisation_id: "org-1", hiring_manager_id: "hm-1" },
    });

    const pipelineCandidates = [
      {
        id: "pc-1",
        candidate_id: "c-1",
        status: "shortlisted",
        stage_id: "s-1",
        created_at: "2024-01-01",
      },
      {
        id: "pc-2",
        candidate_id: "c-2",
        status: "shortlisted",
        stage_id: "s-1",
        created_at: "2024-01-02",
      },
    ];
    const approvals = [
      {
        pipeline_candidate_id: "pc-1",
        approver_role: "recruiter",
        decision: "approved",
        notes: null,
        decided_at: "2024-01-01",
      },
    ];

    mockServerFrom.mockImplementation((table: string) => {
      if (table === "pipeline_candidates") {
        return supabaseChain({ data: pipelineCandidates, error: null });
      }
      if (table === "jobs") {
        return supabaseChain({ data: { title: "Software Engineer" }, error: null });
      }
      return supabaseChain({ data: null, error: null });
    });

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "shortlist_approvals") {
        return supabaseChain({ data: approvals, error: null });
      }
      return supabaseChain({ data: null, error: null });
    });

    const { GET } = await import("@/app/api/jobs/[id]/pipeline/approve/route");
    const req = new NextRequest("http://localhost/api/jobs/job-1/pipeline/approve");
    const res = await GET(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidates).toHaveLength(2);
    expect(body.candidates[0].approvals).toHaveLength(1);
    expect(body.candidates[1].approvals).toHaveLength(0);
  });

  it("returns empty candidates when none in pipeline", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockAssertJobAccess.mockResolvedValue({
      job: { id: "job-1", organisation_id: "org-1", hiring_manager_id: null },
    });

    mockServerFrom.mockReturnValue(supabaseChain({ data: null, error: null }));
    mockAdminFrom.mockReturnValue(supabaseChain({ data: [], error: null }));

    const { GET } = await import("@/app/api/jobs/[id]/pipeline/approve/route");
    const req = new NextRequest("http://localhost/api/jobs/job-1/pipeline/approve");
    const res = await GET(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidates).toEqual([]);
  });
});

describe("POST /api/jobs/[id]/pipeline/approve", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAuthContext.mockReset();
    mockServerFrom.mockReset();
    mockAdminFrom.mockReset();
    mockAssertJobAccess.mockReset();
    mockCreateNotification.mockReset();
    mockTriggerSchedulerAgent.mockReset();
    mockGetDualApprovalStatus.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/jobs/[id]/pipeline/approve/route");
    const req = new NextRequest("http://localhost/api/jobs/job-1/pipeline/approve", {
      method: "POST",
      body: JSON.stringify({ candidateId: "c-1", decision: "approved" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { POST } = await import("@/app/api/jobs/[id]/pipeline/approve/route");
    const req = new NextRequest("http://localhost/api/jobs/job-1/pipeline/approve", {
      method: "POST",
      body: JSON.stringify({ candidateId: "c-1", decision: "approved" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 400 when decision is invalid", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockAssertJobAccess.mockResolvedValue({
      job: { id: "job-1", organisation_id: "org-1", hiring_manager_id: null },
    });

    mockServerFrom.mockReturnValue(supabaseChain({ data: { title: "Engineer" }, error: null }));

    const { POST } = await import("@/app/api/jobs/[id]/pipeline/approve/route");
    const req = new NextRequest("http://localhost/api/jobs/job-1/pipeline/approve", {
      method: "POST",
      body: JSON.stringify({ candidateId: "c-1", decision: "maybe" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("decision");
  });

  it("returns 400 when candidateId is missing", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockAssertJobAccess.mockResolvedValue({
      job: { id: "job-1", organisation_id: "org-1", hiring_manager_id: null },
    });

    mockServerFrom.mockReturnValue(supabaseChain({ data: { title: "Engineer" }, error: null }));

    const { POST } = await import("@/app/api/jobs/[id]/pipeline/approve/route");
    const req = new NextRequest("http://localhost/api/jobs/job-1/pipeline/approve", {
      method: "POST",
      body: JSON.stringify({ decision: "approved" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("candidateId");
  });

  it("returns 400 for malformed JSON body", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockAssertJobAccess.mockResolvedValue({
      job: { id: "job-1", organisation_id: "org-1", hiring_manager_id: null },
    });
    const { POST } = await import("@/app/api/jobs/[id]/pipeline/approve/route");
    const req = new NextRequest("http://localhost/api/jobs/job-1/pipeline/approve", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 404 when candidate not in pipeline", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockAssertJobAccess.mockResolvedValue({
      job: { id: "job-1", organisation_id: "org-1", hiring_manager_id: null },
    });

    mockServerFrom.mockImplementation((table: string) => {
      if (table === "jobs") {
        return supabaseChain({ data: { title: "Engineer" }, error: null });
      }
      if (table === "pipeline_candidates") {
        return supabaseChain({ data: null, error: { code: "PGRST116" } });
      }
      return supabaseChain({ data: null, error: null });
    });

    const { POST } = await import("@/app/api/jobs/[id]/pipeline/approve/route");
    const req = new NextRequest("http://localhost/api/jobs/job-1/pipeline/approve", {
      method: "POST",
      body: JSON.stringify({ candidateId: "c-1", decision: "approved" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(404);
  });

  it("returns 200 when recruiter approves (partially approved)", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockAssertJobAccess.mockResolvedValue({
      job: { id: "job-1", organisation_id: "org-1", hiring_manager_id: "hm-1" },
    });

    mockServerFrom.mockImplementation((table: string) => {
      if (table === "jobs") {
        return supabaseChain({ data: { title: "Engineer" }, error: null });
      }
      if (table === "pipeline_candidates") {
        return supabaseChain({
          data: { id: "pc-1", status: "shortlisted", stage_id: "s-1" },
          error: null,
        });
      }
      return supabaseChain({ data: null, error: null });
    });

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "shortlist_approvals") {
        // First call: check existing approval - none found
        // Second call: insert
        const chain = supabaseChain({ data: null, error: null });
        return chain;
      }
      if (table === "profiles") {
        return supabaseChain({ data: [], error: null });
      }
      return supabaseChain({ data: null, error: null });
    });

    mockGetDualApprovalStatus.mockResolvedValue({ recruiterApproved: true, hmApproved: false });

    const { POST } = await import("@/app/api/jobs/[id]/pipeline/approve/route");
    const req = new NextRequest("http://localhost/api/jobs/job-1/pipeline/approve", {
      method: "POST",
      body: JSON.stringify({ candidateId: "c-1", decision: "approved" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.fullyApproved).toBe(false);
  });

  it("returns 200 with fullyApproved when both recruiter and HM approve", async () => {
    mockGetAuthContext.mockResolvedValue(hiringManagerCtx);
    mockAssertJobAccess.mockResolvedValue({
      job: { id: "job-1", organisation_id: "org-1", hiring_manager_id: "user-hm-1" },
    });

    mockServerFrom.mockImplementation((table: string) => {
      if (table === "jobs") {
        return supabaseChain({ data: { title: "Engineer" }, error: null });
      }
      if (table === "pipeline_candidates") {
        return supabaseChain({
          data: { id: "pc-1", status: "shortlisted", stage_id: "s-1" },
          error: null,
        });
      }
      return supabaseChain({ data: null, error: null });
    });

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "shortlist_approvals") {
        return supabaseChain({ data: null, error: null });
      }
      if (table === "pipeline_candidates") {
        return supabaseChain({ data: null, error: null });
      }
      if (table === "profiles") {
        return supabaseChain({ data: [{ id: "r-1" }], error: null });
      }
      return supabaseChain({ data: null, error: null });
    });

    mockGetDualApprovalStatus.mockResolvedValue({ recruiterApproved: true, hmApproved: true });

    const { POST } = await import("@/app/api/jobs/[id]/pipeline/approve/route");
    const req = new NextRequest("http://localhost/api/jobs/job-1/pipeline/approve", {
      method: "POST",
      body: JSON.stringify({ candidateId: "c-1", decision: "approved" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.fullyApproved).toBe(true);
    expect(mockTriggerSchedulerAgent).toHaveBeenCalled();
  });

  it("returns 409 when same role already submitted decision", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockAssertJobAccess.mockResolvedValue({
      job: { id: "job-1", organisation_id: "org-1", hiring_manager_id: null },
    });

    mockServerFrom.mockImplementation((table: string) => {
      if (table === "jobs") {
        return supabaseChain({ data: { title: "Engineer" }, error: null });
      }
      if (table === "pipeline_candidates") {
        return supabaseChain({
          data: { id: "pc-1", status: "shortlisted", stage_id: "s-1" },
          error: null,
        });
      }
      return supabaseChain({ data: null, error: null });
    });

    // Existing approval found
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "shortlist_approvals") {
        return supabaseChain({ data: { id: "sa-1" }, error: null });
      }
      return supabaseChain({ data: null, error: null });
    });

    const { POST } = await import("@/app/api/jobs/[id]/pipeline/approve/route");
    const req = new NextRequest("http://localhost/api/jobs/job-1/pipeline/approve", {
      method: "POST",
      body: JSON.stringify({ candidateId: "c-1", decision: "approved" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(409);
  });

  it("marks candidate as rejected on rejection decision", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockAssertJobAccess.mockResolvedValue({
      job: { id: "job-1", organisation_id: "org-1", hiring_manager_id: "hm-1" },
    });

    mockServerFrom.mockImplementation((table: string) => {
      if (table === "jobs") {
        return supabaseChain({ data: { title: "Engineer" }, error: null });
      }
      if (table === "pipeline_candidates") {
        return supabaseChain({
          data: { id: "pc-1", status: "shortlisted", stage_id: "s-1" },
          error: null,
        });
      }
      return supabaseChain({ data: null, error: null });
    });

    const adminUpdateMock = vi.fn().mockReturnValue(supabaseChain({ data: null, error: null }));
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "shortlist_approvals") {
        return supabaseChain({ data: null, error: null });
      }
      if (table === "pipeline_candidates") {
        const chain = supabaseChain({ data: null, error: null });
        chain.update = adminUpdateMock;
        return chain;
      }
      return supabaseChain({ data: null, error: null });
    });

    const { POST } = await import("@/app/api/jobs/[id]/pipeline/approve/route");
    const req = new NextRequest("http://localhost/api/jobs/job-1/pipeline/approve", {
      method: "POST",
      body: JSON.stringify({ candidateId: "c-1", decision: "rejected", notes: "Not a good fit" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("rejected");
    expect(body.fullyApproved).toBe(false);
  });
});

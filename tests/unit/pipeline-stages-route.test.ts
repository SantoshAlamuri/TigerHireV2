import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockQueryBuilder } from "../helpers";

const { mockCreateSupabaseAdmin } = vi.hoisted(() => ({
  mockCreateSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockCreateSupabaseAdmin(),
}));

/** Admin client for POST pipeline-stages: initial empty rows, N inserts, final select. */
function pipelineAdminClient(insertCount: number, finalStages: unknown[]) {
  const values: unknown[] = [{ data: [], error: null }];
  for (let i = 0; i < insertCount; i++) values.push({ data: null, error: null });
  values.push({ data: finalStages, error: null });
  let idx = 0;
  const builder: Record<string, unknown> = {};
  for (const c of ["select", "insert", "update", "delete", "eq", "order", "in"]) {
    builder[c] = vi.fn().mockReturnValue(builder);
  }
  builder.then = vi.fn((resolve: (v: unknown) => void) => {
    resolve(values[idx++] ?? { data: null, error: null });
  });
  return {
    from: (t: string) => (t === "pipeline_stages" ? builder : createMockQueryBuilder()),
  };
}

function stageOut(id: string, name: string, order: number) {
  return {
    id,
    job_id: "job-1",
    stage_name: name,
    stage_order: order,
    stage_type: "screening",
    sla_days: null,
    is_locked: false,
    notify_candidate: false,
    color: "#6366f1",
    notify_email_body: null,
    interviewer_email: null,
    interviewer_name: null,
  };
}

const recruiterCtx = {
  userId: "u1",
  role: "recruiter" as const,
  organisationId: "org-1",
};

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: vi.fn(),
  requireAuth: (ctx: unknown) => !!ctx,
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
        }),
      };
    }
  },
  jsonError: (msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), { status }),
  jsonSuccess: (data: unknown) => new Response(JSON.stringify(data), { status: 200 }),
  handleZodError: () =>
    new Response(JSON.stringify({ error: "Invalid request payload" }), { status: 422 }),
}));

const mockFrom = vi.fn();
const mockAgencyClientsQuery = () => ({
  select: () => ({
    eq: () => Promise.resolve({ data: [], error: null }),
  }),
});
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve({ auth: { getUser: vi.fn() }, from: mockFrom }),
}));

const mockAssertJobAccess = vi.fn();
vi.mock("@/lib/job-access", () => ({
  assertJobAccess: (...args: unknown[]) => mockAssertJobAccess(...args),
}));

describe("GET /api/jobs/[id]/pipeline-stages", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFrom.mockReset();
    mockAssertJobAccess.mockReset();
    process.env.FF_INTERVIEWER_IDENTITY_V1 = "false";
    process.env.NEXT_PUBLIC_FF_INTERVIEWER_IDENTITY_V1 = "false";
  });

  it("returns 401 when not authenticated", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/jobs/[id]/pipeline-stages/route");
    const request = new NextRequest("http://localhost/api/jobs/job-1/pipeline-stages");
    const response = await GET(request, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(401);
  });

  it("returns 404 when job not found", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(recruiterCtx as any);
    mockAssertJobAccess.mockResolvedValueOnce({ job: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === "agency_clients") return mockAgencyClientsQuery();
      if (table === "jobs") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: null,
                  error: { message: "not found" },
                }),
            }),
          }),
        };
      }
      return {};
    });
    const { GET } = await import("@/app/api/jobs/[id]/pipeline-stages/route");
    const request = new NextRequest("http://localhost/api/jobs/job-1/pipeline-stages");
    const response = await GET(request, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(404);
  });

  it("returns stages for job when user has access", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(recruiterCtx as any);
    const jobData = {
      id: "job-1",
      organisation_id: "org-1",
      hiring_manager_id: null,
    };
    mockAssertJobAccess.mockResolvedValueOnce({ job: jobData });
    const stagesData = [
      { id: "s1", stage_name: "Screen", stage_order: 1 },
      { id: "s2", stage_name: "Interview", stage_order: 2 },
    ];
    mockFrom.mockImplementation((table: string) => {
      if (table === "agency_clients") return mockAgencyClientsQuery();
      if (table === "jobs") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: jobData, error: null }),
            }),
          }),
        };
      }
      if (table === "pipeline_stages") {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: stagesData, error: null }),
            }),
          }),
        };
      }
      return {};
    });
    const { GET } = await import("@/app/api/jobs/[id]/pipeline-stages/route");
    const request = new NextRequest("http://localhost/api/jobs/job-1/pipeline-stages");
    const response = await GET(request, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.stages).toHaveLength(2);
    expect(body.stages[0].stage_name).toBe("Screen");
  });

  it("GET returns stages ordered by stage_order", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(recruiterCtx as any);
    const jobData = {
      id: "job-1",
      organisation_id: "org-1",
      hiring_manager_id: null,
    };
    mockAssertJobAccess.mockResolvedValueOnce({ job: jobData });
    const stagesData = [
      { id: "s3", stage_name: "Final", stage_order: 3 },
      { id: "s1", stage_name: "Screen", stage_order: 1 },
      { id: "s2", stage_name: "Interview", stage_order: 2 },
    ];
    let orderCalled = false;
    mockFrom.mockImplementation((table: string) => {
      if (table === "agency_clients") return mockAgencyClientsQuery();
      if (table === "jobs") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: jobData, error: null }),
            }),
          }),
        };
      }
      if (table === "pipeline_stages") {
        return {
          select: () => ({
            eq: () => ({
              order: (column: string, options: { ascending: boolean }) => {
                orderCalled = true;
                expect(column).toBe("stage_order");
                expect(options.ascending).toBe(true);
                // Return sorted data
                const sorted = [...stagesData].sort((a, b) => a.stage_order - b.stage_order);
                return Promise.resolve({ data: sorted, error: null });
              },
            }),
          }),
        };
      }
      return {};
    });
    const { GET } = await import("@/app/api/jobs/[id]/pipeline-stages/route");
    const request = new NextRequest("http://localhost/api/jobs/job-1/pipeline-stages");
    const response = await GET(request, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(orderCalled).toBe(true);
    expect(body.stages).toHaveLength(3);
    expect(body.stages[0].stage_order).toBe(1);
    expect(body.stages[1].stage_order).toBe(2);
    expect(body.stages[2].stage_order).toBe(3);
  });
});

describe("POST /api/jobs/[id]/pipeline-stages", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFrom.mockReset();
    mockAssertJobAccess.mockReset();
    mockCreateSupabaseAdmin.mockReset();
    process.env.FF_INTERVIEWER_IDENTITY_V1 = "false";
    process.env.NEXT_PUBLIC_FF_INTERVIEWER_IDENTITY_V1 = "false";
  });

  it("returns 401 when not authenticated", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/jobs/[id]/pipeline-stages/route");
    const request = new NextRequest("http://localhost/api/jobs/job-1/pipeline-stages", {
      method: "POST",
      body: JSON.stringify({
        stages: [{ stage_name: "Screen", stage_order: 1 }],
      }),
    });
    const response = await POST(request, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(401);
  });

  it("returns 422 when stages array is empty (Zod min 1)", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(recruiterCtx as any);
    const jobData = {
      id: "job-1",
      organisation_id: "org-1",
      hiring_manager_id: null,
    };
    mockAssertJobAccess.mockResolvedValueOnce({ job: jobData });
    mockFrom.mockImplementation((table: string) => {
      if (table === "agency_clients") return mockAgencyClientsQuery();
      if (table === "jobs")
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: jobData, error: null }),
            }),
          }),
        };
      return {};
    });
    const { POST } = await import("@/app/api/jobs/[id]/pipeline-stages/route");
    const request = new NextRequest("http://localhost/api/jobs/job-1/pipeline-stages", {
      method: "POST",
      body: JSON.stringify({ stages: [] }),
    });
    const response = await POST(request, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(422);
  });

  it("returns 200 and created stages when valid body", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(recruiterCtx as any);
    const jobData = {
      id: "job-1",
      organisation_id: "org-1",
      hiring_manager_id: null,
    };
    mockAssertJobAccess.mockResolvedValueOnce({ job: jobData });
    mockFrom.mockImplementation((table: string) => {
      if (table === "agency_clients") return mockAgencyClientsQuery();
      if (table === "jobs")
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: jobData, error: null }),
            }),
          }),
        };
      return {};
    });
    mockCreateSupabaseAdmin.mockReturnValue(pipelineAdminClient(1, [stageOut("s1", "Screen", 1)]));
    const { POST } = await import("@/app/api/jobs/[id]/pipeline-stages/route");
    const request = new NextRequest("http://localhost/api/jobs/job-1/pipeline-stages", {
      method: "POST",
      body: JSON.stringify({
        stages: [{ stage_name: "Screen", stage_order: 1 }],
      }),
    });
    const response = await POST(request, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.stages).toHaveLength(1);
    expect(body.stages[0].stage_name).toBe("Screen");
  });

  it("POST creates stages for a job", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(recruiterCtx as any);
    const jobData = {
      id: "job-1",
      organisation_id: "org-1",
      hiring_manager_id: null,
    };
    mockAssertJobAccess.mockResolvedValueOnce({ job: jobData });
    mockFrom.mockImplementation((table: string) => {
      if (table === "agency_clients") return mockAgencyClientsQuery();
      if (table === "jobs")
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: jobData, error: null }),
            }),
          }),
        };
      return {};
    });
    mockCreateSupabaseAdmin.mockReturnValue(
      pipelineAdminClient(2, [stageOut("s1", "Screen", 1), stageOut("s2", "Interview", 2)]),
    );
    const { POST } = await import("@/app/api/jobs/[id]/pipeline-stages/route");
    const request = new NextRequest("http://localhost/api/jobs/job-1/pipeline-stages", {
      method: "POST",
      body: JSON.stringify({
        stages: [
          { stage_name: "Screen", stage_order: 1 },
          { stage_name: "Interview", stage_order: 2 },
        ],
      }),
    });
    const response = await POST(request, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.stages).toHaveLength(2);
    expect(body.stages[0].stage_name).toBe("Screen");
    expect(body.stages[1].stage_name).toBe("Interview");
  });

  it("returns 422 when stage_name is missing (Zod)", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(recruiterCtx as any);
    const jobData = {
      id: "job-1",
      organisation_id: "org-1",
      hiring_manager_id: null,
    };
    mockAssertJobAccess.mockResolvedValueOnce({ job: jobData });
    mockFrom.mockImplementation((table: string) => {
      if (table === "agency_clients") return mockAgencyClientsQuery();
      if (table === "jobs")
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: jobData, error: null }),
            }),
          }),
        };
      return {};
    });
    const { POST } = await import("@/app/api/jobs/[id]/pipeline-stages/route");
    const request = new NextRequest("http://localhost/api/jobs/job-1/pipeline-stages", {
      method: "POST",
      body: JSON.stringify({
        stages: [{ stage_order: 1 }], // Missing stage_name
      }),
    });
    const response = await POST(request, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(422);
  });

  it("returns 403 for unauthorized users", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    const candidateCtx = {
      userId: "u1",
      role: "candidate_free" as const,
      organisationId: null,
    };
    vi.mocked(getAuthContext).mockResolvedValueOnce(candidateCtx as any);
    const { GET } = await import("@/app/api/jobs/[id]/pipeline-stages/route");
    const request = new NextRequest("http://localhost/api/jobs/job-1/pipeline-stages");
    const response = await GET(request, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(403);
  });
});

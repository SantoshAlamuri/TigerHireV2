import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { recruiterCtx, candidateCtx } from "../helpers";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/api-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-helpers")>("@/lib/api-helpers");
  return {
    ...actual,
    getAuthContext: () => mockGetAuthContext(),
    requireAuth: (ctx: unknown) => ctx !== null,
    hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
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
  };
});

const mockJob = { id: "j1", organisation_id: "org-1", hiring_manager_id: null };
const mockStages = [
  { id: "s1", stage_name: "Phone Screen", stage_order: 1 },
  { id: "s2", stage_name: "Technical", stage_order: 2 },
  { id: "s3", stage_name: "Final", stage_order: 3 },
];

const chainMock = (overrideData?: unknown) => {
  const m: Record<string, unknown> = {};
  for (const method of ["select", "insert", "update", "delete", "eq", "order"]) {
    m[method] = vi.fn().mockReturnValue(m);
  }
  m.single = vi.fn().mockResolvedValue({ data: overrideData ?? mockJob, error: null });
  m.then = vi.fn((resolve: (v: unknown) => void) =>
    resolve({ data: overrideData ?? mockStages, error: null }),
  );
  return m;
};

const mockFrom = vi.fn().mockImplementation((table: string) => {
  if (table === "jobs") return chainMock(mockJob);
  if (table === "pipeline_stages") return chainMock(mockStages);
  return chainMock();
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve({ from: mockFrom }),
}));

const mockAssertJobAccess = vi.fn();
vi.mock("@/lib/job-access", () => ({
  assertJobAccess: (...args: unknown[]) => mockAssertJobAccess(...args),
}));

const { mockCreateSupabaseAdmin } = vi.hoisted(() => ({
  mockCreateSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockCreateSupabaseAdmin(),
}));

/** Sequenced `then` results for `await` on admin pipeline_stages chains (POST handler). */
function pipelineAdminSequenced(results: unknown[]) {
  let idx = 0;
  const m: Record<string, unknown> = {};
  for (const method of ["select", "insert", "update", "delete", "eq", "order"]) {
    m[method] = vi.fn().mockReturnValue(m);
  }
  m.then = vi.fn((resolve: (v: unknown) => void) => {
    resolve(results[idx++] ?? { data: null, error: null });
  });
  return {
    from: (table: string) => {
      if (table === "pipeline_stages") return m;
      return chainMock();
    },
  };
}

function exRow(id: string, name: string, order: number) {
  return {
    id,
    stage_name: name,
    stage_order: order,
    stage_type: "screening",
    is_locked: false,
    sla_days: null,
    notify_candidate: false,
    color: "#6366f1",
  };
}

const STAGE_ID_1 = "11111111-1111-4111-8111-111111111111";
const STAGE_ID_2 = "22222222-2222-4222-8222-222222222222";
const STAGE_ID_3 = "33333333-3333-4333-8333-333333333333";
const STAGE_ID_NEW = "44444444-4444-4444-8444-444444444444";

function fullStage(
  id: string,
  name: string,
  order: number,
  extras: Partial<{ interviewer_email: string | null }> = {},
) {
  return {
    id,
    job_id: "j1",
    stage_name: name,
    stage_order: order,
    stage_type: "screening",
    sla_days: null,
    is_locked: false,
    notify_candidate: false,
    color: "#6366f1",
    notify_email_body: null,
    interviewer_email: extras.interviewer_email ?? null,
    interviewer_name: null,
  };
}

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe("GET /api/jobs/[id]/pipeline-stages (integration)", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockFrom.mockClear();
    mockAssertJobAccess.mockReset();
    mockAssertJobAccess.mockResolvedValue({ job: mockJob });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/jobs/[id]/pipeline-stages/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/pipeline-stages");
    const res = await GET(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { GET } = await import("@/app/api/jobs/[id]/pipeline-stages/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/pipeline-stages");
    const res = await GET(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 with stages for recruiter", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { GET } = await import("@/app/api/jobs/[id]/pipeline-stages/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/pipeline-stages");
    const res = await GET(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stages).toBeDefined();
  });

  it("queries pipeline_stages table with job_id filter", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { GET } = await import("@/app/api/jobs/[id]/pipeline-stages/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/pipeline-stages");
    await GET(req, { params: Promise.resolve({ id: "j1" }) });
    expect(mockFrom).toHaveBeenCalledWith("pipeline_stages");
  });
});

describe("POST /api/jobs/[id]/pipeline-stages (integration)", () => {
  beforeEach(() => {
    mockAssertJobAccess.mockReset();
    mockAssertJobAccess.mockResolvedValue({ job: mockJob });
    mockGetAuthContext.mockReset();
    mockFrom.mockClear();
    mockCreateSupabaseAdmin.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/jobs/[id]/pipeline-stages/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/pipeline-stages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stages: [] }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 422 when stages array is empty (Zod min 1)", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/jobs/[id]/pipeline-stages/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/pipeline-stages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stages: [] }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(422);
  });

  it("creates new stages (insert path)", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockCreateSupabaseAdmin.mockReturnValue(
      pipelineAdminSequenced([
        { data: [], error: null },
        { data: null, error: null },
        { data: null, error: null },
        {
          data: [fullStage(STAGE_ID_1, "Phone Screen", 1), fullStage(STAGE_ID_2, "Onsite", 2)],
          error: null,
        },
      ]),
    );
    const { POST } = await import("@/app/api/jobs/[id]/pipeline-stages/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/pipeline-stages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stages: [
          { stage_name: "Phone Screen", stage_order: 1 },
          { stage_name: "Onsite", stage_order: 2 },
        ],
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stages).toBeDefined();
  });

  it("updates existing stages (update path)", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockCreateSupabaseAdmin.mockReturnValue(
      pipelineAdminSequenced([
        {
          data: [exRow(STAGE_ID_1, "Phone Screen", 1), exRow(STAGE_ID_2, "Technical", 2)],
          error: null,
        },
        { data: null, error: null },
        { data: null, error: null },
        {
          data: [
            fullStage(STAGE_ID_1, "Updated Screen", 1),
            fullStage(STAGE_ID_2, "Technical Updated", 2, {
              interviewer_email: "tech@example.com",
            }),
          ],
          error: null,
        },
      ]),
    );
    const { POST } = await import("@/app/api/jobs/[id]/pipeline-stages/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/pipeline-stages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stages: [
          { id: STAGE_ID_1, stage_name: "Updated Screen", stage_order: 1 },
          {
            id: STAGE_ID_2,
            stage_name: "Technical Updated",
            stage_order: 2,
            interviewer_email: "tech@example.com",
          },
        ],
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(200);
  });

  it("handles reordering stages", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockCreateSupabaseAdmin.mockReturnValue(
      pipelineAdminSequenced([
        {
          data: [
            exRow(STAGE_ID_3, "Final", 3),
            exRow(STAGE_ID_1, "Phone Screen", 1),
            exRow(STAGE_ID_2, "Technical", 2),
          ],
          error: null,
        },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        {
          data: [
            fullStage(STAGE_ID_3, "Final", 1),
            fullStage(STAGE_ID_1, "Phone Screen", 2),
            fullStage(STAGE_ID_2, "Technical", 3),
          ],
          error: null,
        },
      ]),
    );
    const { POST } = await import("@/app/api/jobs/[id]/pipeline-stages/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/pipeline-stages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stages: [
          { id: STAGE_ID_3, stage_name: "Final", stage_order: 1 },
          { id: STAGE_ID_1, stage_name: "Phone Screen", stage_order: 2 },
          { id: STAGE_ID_2, stage_name: "Technical", stage_order: 3 },
        ],
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(200);
  });

  it("handles mix of new and existing stages", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockCreateSupabaseAdmin.mockReturnValue(
      pipelineAdminSequenced([
        {
          data: [exRow(STAGE_ID_1, "Phone Screen", 1), exRow(STAGE_ID_2, "Technical", 2)],
          error: null,
        },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        {
          data: [
            fullStage(STAGE_ID_1, "Phone Screen", 1),
            fullStage(STAGE_ID_NEW, "New Stage", 2),
            fullStage(STAGE_ID_2, "Technical", 3),
          ],
          error: null,
        },
      ]),
    );
    const { POST } = await import("@/app/api/jobs/[id]/pipeline-stages/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/pipeline-stages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stages: [
          { id: STAGE_ID_1, stage_name: "Phone Screen", stage_order: 1 },
          { stage_name: "New Stage", stage_order: 2 },
          { id: STAGE_ID_2, stage_name: "Technical", stage_order: 3 },
        ],
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(200);
  });
});

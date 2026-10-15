import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { recruiterCtx, candidateCtx, companyAdminCtx } from "../helpers";

const mockGetAuthContext = vi.fn();
const mockValidateOrigin = vi.fn();

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

const mockSupabaseAdmin = {
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
};

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockSupabaseAdmin,
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe("GET /api/org/pipeline-defaults", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockValidateOrigin.mockReturnValue(null);
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/org/pipeline-defaults/route");
    const req = new NextRequest("http://localhost:3000/api/org/pipeline-defaults");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { GET } = await import("@/app/api/org/pipeline-defaults/route");
    const req = new NextRequest("http://localhost:3000/api/org/pipeline-defaults");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 when no organisation", async () => {
    mockGetAuthContext.mockResolvedValue({ ...recruiterCtx, organisationId: null });
    const { GET } = await import("@/app/api/org/pipeline-defaults/route");
    const req = new NextRequest("http://localhost:3000/api/org/pipeline-defaults");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns pipeline defaults for recruiter", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockSupabaseAdmin
      .from()
      .select()
      .eq()
      .order.mockResolvedValue({
        data: [
          {
            id: "stage-1",
            organisation_id: recruiterCtx.organisationId,
            stage_name: "Phone Screen",
            stage_order: 0,
          },
          {
            id: "stage-2",
            organisation_id: recruiterCtx.organisationId,
            stage_name: "Technical Interview",
            stage_order: 1,
          },
        ],
        error: null,
      });

    const { GET } = await import("@/app/api/org/pipeline-defaults/route");
    const req = new NextRequest("http://localhost:3000/api/org/pipeline-defaults");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stages).toBeDefined();
    expect(body.stages.length).toBe(2);
  });
});

describe("POST /api/org/pipeline-defaults", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockValidateOrigin.mockReturnValue(null);
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/org/pipeline-defaults/route");
    const req = new NextRequest("http://localhost:3000/api/org/pipeline-defaults", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stages: [{ stage_name: "New Stage", stage_order: 0 }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for recruiter role (only admin can POST)", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/org/pipeline-defaults/route");
    const req = new NextRequest("http://localhost:3000/api/org/pipeline-defaults", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stages: [{ stage_name: "New Stage", stage_order: 0 }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("creates new pipeline defaults for leadership", async () => {
    mockGetAuthContext.mockResolvedValue({ ...companyAdminCtx, isOrgAdmin: true });
    mockSupabaseAdmin
      .from()
      .insert()
      .select()
      .single.mockResolvedValue({
        data: {
          id: "new-stage-1",
          stage_name: "New Stage",
          stage_order: 0,
        },
        error: null,
      });

    const { POST } = await import("@/app/api/org/pipeline-defaults/route");
    const req = new NextRequest("http://localhost:3000/api/org/pipeline-defaults", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stages: [{ stage_name: "New Stage", stage_order: 0 }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.stages).toBeDefined();
  });

  it("updates existing pipeline defaults", async () => {
    mockGetAuthContext.mockResolvedValue({ ...companyAdminCtx, isOrgAdmin: true });
    const stageId = "00000000-0000-4000-8000-000000000001";
    mockSupabaseAdmin
      .from()
      .select()
      .eq()
      .eq()
      .maybeSingle.mockResolvedValue({
        data: { is_locked: false, stage_name: "Previous", stage_order: 0 },
        error: null,
      });
    mockSupabaseAdmin
      .from()
      .update()
      .eq()
      .eq()
      .select()
      .single.mockResolvedValue({
        data: {
          id: stageId,
          stage_name: "Updated Stage",
          stage_order: 0,
        },
        error: null,
      });

    const { POST } = await import("@/app/api/org/pipeline-defaults/route");
    const req = new NextRequest("http://localhost:3000/api/org/pipeline-defaults", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stages: [{ id: stageId, stage_name: "Updated Stage", stage_order: 0 }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { recruiterCtx } from "../helpers";

const mockGetAuthContext = vi.fn();
const mockValidateOrigin = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
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
  handleApiError: (_err: unknown, msg: string) =>
    new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: (...args: unknown[]) => mockValidateOrigin(...args),
}));

const createBuilder = (result: { data?: unknown; error?: unknown } = {}) => {
  const payload = { data: result.data ?? null, error: result.error ?? null };
  const builder: Record<string, unknown> = {};
  const chainMethods = ["select", "eq", "order", "update", "in"];
  for (const method of chainMethods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }
  builder.single = vi.fn().mockResolvedValue(payload);
  builder.then = vi.fn((resolve: (v: unknown) => void) => resolve(payload));
  return builder;
};

const mockSupabaseAdmin = {
  from: vi.fn(),
};

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockSupabaseAdmin,
}));

describe("POST /api/jobs/[id]/pipeline/repair-stage-links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateOrigin.mockReturnValue(null);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/jobs/[id]/pipeline/repair-stage-links/route");
    const req = new NextRequest(
      "http://localhost:3000/api/jobs/job-1/pipeline/repair-stage-links",
      {
        method: "POST",
        body: "{}",
      },
    );
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(401);
  });

  it("repairs missing and invalid stage links", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);

    const jobsBuilder = createBuilder({
      data: { id: "job-1", organisation_id: "org-1" },
    });
    const stagesBuilder = createBuilder({
      data: [
        {
          id: "stage-shortlisted",
          stage_name: "Shortlisted",
          stage_order: 0,
          stage_type: "screening",
          is_locked: false,
        },
        {
          id: "stage-hired",
          stage_name: "Hired",
          stage_order: 99,
          stage_type: "terminal_hired",
          is_locked: true,
        },
        {
          id: "stage-rejected",
          stage_name: "Rejected",
          stage_order: 100,
          stage_type: "terminal_reject",
          is_locked: true,
        },
      ],
    });
    const pipelineBuilder = createBuilder({
      data: [
        { id: "pc-1", candidate_id: "cand-1", status: "shortlisted", stage_id: null },
        { id: "pc-2", candidate_id: "cand-2", status: "rejected", stage_id: "missing-stage-id" },
      ],
    });
    const updateBuilder = createBuilder();
    const applicationsBuilder = createBuilder();

    mockSupabaseAdmin.from.mockImplementation((table: string) => {
      if (table === "jobs") return jobsBuilder;
      if (table === "pipeline_stages") return stagesBuilder;
      if (table === "pipeline_candidates") {
        const pipelineSelectCalls = (pipelineBuilder.select as ReturnType<typeof vi.fn>).mock.calls
          .length;
        return pipelineSelectCalls === 0 ? pipelineBuilder : updateBuilder;
      }
      if (table === "applications") return applicationsBuilder;
      throw new Error(`Unexpected table: ${table}`);
    });

    const { POST } = await import("@/app/api/jobs/[id]/pipeline/repair-stage-links/route");
    const req = new NextRequest(
      "http://localhost:3000/api/jobs/job-1/pipeline/repair-stage-links",
      {
        method: "POST",
        body: "{}",
      },
    );
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.repaired).toBe(2);
    expect(body.examined).toBe(2);
    expect(body.skipped).toBe(0);
  });
});

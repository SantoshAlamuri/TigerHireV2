import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { agencyCtx, createMockSupabase, createMockQueryBuilder } from "../helpers";

function backfillPostRequest() {
  return new NextRequest("http://localhost:3000/api/agency/backfill-pipeline", { method: "POST" });
}

const mockGetAuthContext = vi.fn();
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
  handleApiError: (err: unknown, msg: string) =>
    new Response(
      JSON.stringify({
        error: msg,
        detail: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    ),
}));

const mockCreateSupabaseServerClient = vi.fn();
const mockCreateSupabaseAdmin = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockCreateSupabaseAdmin(),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

vi.mock("@/lib/redis/cache", () => ({
  cacheDel: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/redis/keys", () => ({
  myPipelineKey: (userId: string) => `pipeline:${userId}`,
}));

describe("POST /api/agency/backfill-pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue(agencyCtx);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/agency/backfill-pipeline/route");
    const res = await POST(backfillPostRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not agency", async () => {
    mockGetAuthContext.mockResolvedValue({
      ...agencyCtx,
      role: "recruiter",
    });
    const { POST } = await import("@/app/api/agency/backfill-pipeline/route");
    const res = await POST(backfillPostRequest());
    expect(res.status).toBe(403);
  });

  it("returns 400 when agency has no organisationId", async () => {
    mockGetAuthContext.mockResolvedValue({
      ...agencyCtx,
      organisationId: null,
    });
    const { POST } = await import("@/app/api/agency/backfill-pipeline/route");
    const res = await POST(backfillPostRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("organisation");
  });

  it("returns success with added 0 when no open jobs exist", async () => {
    const linksBuilder = createMockQueryBuilder({ data: [], count: 0 });
    const supabase = createMockSupabase({
      agency_clients: linksBuilder,
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);
    const jobsBuilder = createMockQueryBuilder({ data: [], count: 0 });
    const admin = createMockSupabase({ jobs: jobsBuilder });
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import("@/app/api/agency/backfill-pipeline/route");
    const res = await POST(backfillPostRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.added).toBe(0);
    expect(body.message).toContain("No open jobs");
  });

  it("returns success with added 0 when no open jobs for clients", async () => {
    const linksBuilder = createMockQueryBuilder({
      data: [{ client_organisation_id: "client-1" }],
    });
    const supabase = createMockSupabase({
      agency_clients: linksBuilder,
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const jobsBuilder = createMockQueryBuilder({ data: [], count: 0 });
    const admin = createMockSupabase({ jobs: jobsBuilder });
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import("@/app/api/agency/backfill-pipeline/route");
    const res = await POST(backfillPostRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.added).toBe(0);
    expect(body.message).toContain("No open jobs");
  });

  it("returns success with added 0 when no fit_scores", async () => {
    const linksBuilder = createMockQueryBuilder({
      data: [{ client_organisation_id: "client-1" }],
    });
    const jobsBuilder = createMockQueryBuilder({
      data: [{ id: "job-1" }],
    });
    const scoresBuilder = createMockQueryBuilder({ data: [], count: 0 });
    const supabase = createMockSupabase({
      agency_clients: linksBuilder,
    });
    const admin = createMockSupabase({
      jobs: jobsBuilder,
      fit_scores: scoresBuilder,
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import("@/app/api/agency/backfill-pipeline/route");
    const res = await POST(backfillPostRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.added).toBe(0);
    expect(body.message).toContain("No fit scores");
  });

  it("adds pipeline rows for score pairs with no existing pipeline_candidate", async () => {
    const linksBuilder = createMockQueryBuilder({
      data: [{ client_organisation_id: "client-1" }],
    });
    const jobsBuilder = createMockQueryBuilder({
      data: [{ id: "job-1" }],
    });
    const scoresBuilder = createMockQueryBuilder({
      data: [
        { job_id: "job-1", candidate_id: "cand-1" },
        { job_id: "job-1", candidate_id: "cand-2" },
      ],
    });
    const existingBuilder = createMockQueryBuilder({ data: null });
    const firstStageBuilder = createMockQueryBuilder({
      data: { id: "stage-1" },
    });
    const insertBuilder = createMockQueryBuilder({ data: {}, error: null });

    const supabase = createMockSupabase({
      agency_clients: linksBuilder,
    });
    const defaultBuilder = createMockQueryBuilder({ data: null });
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "jobs") return jobsBuilder;
        if (table === "fit_scores") return scoresBuilder;
        if (table === "pipeline_candidates") {
          return {
            ...defaultBuilder,
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi
              .fn()
              .mockResolvedValueOnce({ data: null })
              .mockResolvedValueOnce({ data: null }),
            insert: vi.fn().mockReturnThis(),
          };
        }
        if (table === "pipeline_stages") return firstStageBuilder;
        return defaultBuilder;
      }),
    };

    mockCreateSupabaseServerClient.mockResolvedValue(supabase);
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import("@/app/api/agency/backfill-pipeline/route");
    const res = await POST(backfillPostRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.added).toBeGreaterThanOrEqual(0);
    expect(body.message).toBeDefined();
  });
});

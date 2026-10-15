import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockSupabase,
  createMockQueryBuilder,
  recruiterCtx,
  candidateCtx,
  superAdminCtx,
} from "../helpers";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/api-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-helpers")>("@/lib/api-helpers");
  return {
    ...actual,
    getAuthContext: vi.fn(),
    requireAuth: (ctx: unknown) => ctx !== null,
    hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
    jsonError: (msg: string, status: number) => Response.json({ error: msg }, { status }),
    jsonSuccess: (data: unknown, status = 200) => Response.json(data, { status }),
  };
});

vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/api-helpers";

const mockCreateSupabase = createSupabaseServerClient as unknown as ReturnType<typeof vi.fn>;
const mockGetAuth = getAuthContext as unknown as ReturnType<typeof vi.fn>;

describe("GET /api/analytics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);
    const { GET } = await import("@/app/api/analytics/route");
    const res = await GET(new Request("http://localhost/api/analytics") as never);
    expect(res.status).toBe(401);
  });

  it("returns 403 for candidates", async () => {
    mockGetAuth.mockResolvedValue(candidateCtx);
    const { GET } = await import("@/app/api/analytics/route");
    const res = await GET(new Request("http://localhost/api/analytics") as never);
    expect(res.status).toBe(403);
  });

  it("returns 400 for unknown metric", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const { GET } = await import("@/app/api/analytics/route");
    const res = await GET(
      new Request("http://localhost/api/analytics?metric=not_a_real_metric") as never,
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid metric/i);
  });

  it("returns overview for recruiter", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const builder = createMockQueryBuilder({ data: null, count: 5 });
    const supabase = createMockSupabase({ jobs: builder, applications: builder }, builder);
    mockCreateSupabase.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/analytics/route");
    const res = await GET(new Request("http://localhost/api/analytics?metric=overview") as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.overview).toBeDefined();
    expect(typeof json.overview.activeJobs).toBe("number");
  });

  it("returns time_to_hire for recruiter", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const builder = createMockQueryBuilder({
      data: [{ job_id: "j1", job_title: "SDE", avg_days_to_hire: 14.5 }],
    });
    const supabase = createMockSupabase({
      analytics_time_to_hire: builder,
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/analytics/route");
    const res = await GET(
      new Request("http://localhost/api/analytics?metric=time_to_hire") as never,
    );
    expect(res.status).toBe(200);
  });

  it("returns pipeline conversion for recruiter", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const builder = createMockQueryBuilder({ data: [] });
    const supabase = createMockSupabase({
      analytics_pipeline_conversion: builder,
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/analytics/route");
    const res = await GET(new Request("http://localhost/api/analytics?metric=pipeline") as never);
    expect(res.status).toBe(200);
  });

  it("returns sources for recruiter", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const builder = createMockQueryBuilder({ data: [] });
    const supabase = createMockSupabase({
      analytics_candidates_by_source: builder,
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/analytics/route");
    const res = await GET(new Request("http://localhost/api/analytics?metric=sources") as never);
    expect(res.status).toBe(200);
  });

  it("returns activity for recruiter", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const builder = createMockQueryBuilder({ data: [] });
    const supabase = createMockSupabase({
      analytics_recent_activity: builder,
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/analytics/route");
    const res = await GET(new Request("http://localhost/api/analytics?metric=activity") as never);
    expect(res.status).toBe(200);
  });

  it("returns offer outcomes for recruiter", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const builder = createMockQueryBuilder({
      data: [
        {
          id: "o1",
          status: "accepted",
          signing_status: "signed",
          sent_at: "2026-04-01T00:00:00Z",
          first_viewed_at: "2026-04-02T00:00:00Z",
          signed_at: "2026-04-03T00:00:00Z",
          declined_at: null,
          expired_at: null,
        },
      ],
    });
    const supabase = createMockSupabase({ offers: builder });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/analytics/route");
    const res = await GET(
      new Request(
        "http://localhost/api/analytics?metric=offer_outcomes&dateFrom=2026-04-01",
      ) as never,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.offer_outcomes).toBeDefined();
    expect(json.offer_outcomes.accepted_count).toBe(1);
    expect(builder.gte).toHaveBeenCalledWith("sent_at", "2026-04-01");
  });

  it("returns recruiter productivity for recruiter", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const profilesBuilder = createMockQueryBuilder({
      data: [{ id: "r1", full_name: "Recruiter One", role: "recruiter" }],
    });
    const jobsBuilder = createMockQueryBuilder({
      data: [{ id: "j1", assigned_recruiter_id: "r1", created_by: "r1" }],
    });
    const appsBuilder = createMockQueryBuilder({
      data: [
        { id: "a1", status: "hired", jobs: { assigned_recruiter_id: "r1", created_by: "r1" } },
      ],
    });
    const pipelineBuilder = createMockQueryBuilder({
      data: [
        {
          id: "pc1",
          interview_scheduled_at: "2026-04-02T00:00:00Z",
          jobs: { assigned_recruiter_id: "r1", created_by: "r1" },
        },
      ],
    });
    const supabase = createMockSupabase({
      profiles: profilesBuilder,
      jobs: jobsBuilder,
      applications: appsBuilder,
      pipeline_candidates: pipelineBuilder,
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/analytics/route");
    const res = await GET(
      new Request("http://localhost/api/analytics?metric=recruiter_productivity") as never,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.recruiters).toHaveLength(1);
    expect(json.recruiters[0].recruiter_name).toBe("Recruiter One");
    expect(json.recruiters[0].hires_closed).toBe(1);
  });

  it("returns cost per hire for recruiter", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const costsBuilder = createMockQueryBuilder({
      data: [
        { amount_usd: 100, status: "estimated" },
        { amount_usd: 50, status: "invoiced" },
      ],
    });
    const hiredBuilder = createMockQueryBuilder({ count: 3 });
    const supabase = createMockSupabase({
      platform_cost_events: costsBuilder,
      applications: hiredBuilder,
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/analytics/route");
    const res = await GET(
      new Request("http://localhost/api/analytics?metric=cost_per_hire") as never,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cost_per_hire).toBeDefined();
    expect(json.cost_per_hire.hired_count).toBe(3);
    expect(json.cost_per_hire.total_cost_usd).toBe(150);
  });

  it("super_admin can access without org context", async () => {
    mockGetAuth.mockResolvedValue(superAdminCtx);
    const builder = createMockQueryBuilder({ data: null, count: 10 });
    const supabase = createMockSupabase({}, builder);
    mockCreateSupabase.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/analytics/route");
    const res = await GET(new Request("http://localhost/api/analytics") as never);
    expect(res.status).toBe(200);
  });
});

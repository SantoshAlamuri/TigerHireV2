import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, createMockQueryBuilder, recruiterCtx } from "../helpers";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: vi.fn(),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  jsonError: (msg: string, status: number) => Response.json({ error: msg }, { status }),
  handleApiError: (err: unknown) => Response.json({ error: String(err) }, { status: 500 }),
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/api-helpers";

const mockCreateSupabase = createSupabaseServerClient as unknown as ReturnType<typeof vi.fn>;
const mockCreateSupabaseAdmin = createSupabaseAdmin as unknown as ReturnType<typeof vi.fn>;
const mockGetAuth = getAuthContext as unknown as ReturnType<typeof vi.fn>;

describe("GET /api/analytics/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSupabaseAdmin.mockReturnValue(
      createMockSupabase({
        audit_log: createMockQueryBuilder({ data: [{ id: "audit-1" }], error: null }),
      }),
    );
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuth.mockResolvedValue(null);
    const { GET } = await import("@/app/api/analytics/export/route");
    const res = await GET(
      new Request("http://localhost/api/analytics/export?metric=pipeline") as never,
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for unsupported metric", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    mockCreateSupabase.mockResolvedValue(createMockSupabase());
    const { GET } = await import("@/app/api/analytics/export/route");
    const res = await GET(
      new Request("http://localhost/api/analytics/export?metric=unknown") as never,
    );
    expect(res.status).toBe(400);
  });

  it("applies boards from/to filters and returns csv", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const boardsBuilder = createMockQueryBuilder({
      data: [
        {
          id: "d1",
          job_id: "job-1",
          board: "indeed",
          status: "pushed",
          pushed_at: "2026-03-01T10:00:00Z",
          removed_at: null,
          error: null,
          jobs: { title: "SDE II" },
        },
      ],
    });
    const supabase = createMockSupabase({ job_distributions: boardsBuilder });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/analytics/export/route");
    const res = await GET(
      new Request(
        "http://localhost/api/analytics/export?metric=boards&from=2026-03-01T00:00:00Z&to=2026-03-31T23:59:59Z",
      ) as never,
    );

    expect(res.status).toBe(200);
    expect(boardsBuilder.gte).toHaveBeenCalledWith("pushed_at", "2026-03-01T00:00:00Z");
    expect(boardsBuilder.lte).toHaveBeenCalledWith("pushed_at", "2026-03-31T23:59:59Z");
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("analytics-boards.csv");
    const csv = await res.text();
    expect(csv).toContain("job_title");
    expect(csv).toContain("SDE II");
  });

  it("exports overview metric as csv", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const jobsBuilder = createMockQueryBuilder({ count: 3 });
    const applicationsBuilder = createMockQueryBuilder({ count: 7 });
    const supabase = createMockSupabase({
      jobs: jobsBuilder,
      applications: applicationsBuilder,
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/analytics/export/route");
    const res = await GET(
      new Request("http://localhost/api/analytics/export?metric=overview") as never,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("analytics-overview.csv");
    const csv = await res.text();
    expect(csv).toContain(
      "activeJobs,totalApplications,hiredCount,pendingApplications,applicationsThisMonth",
    );
  });

  it("exports offer outcomes metric as csv", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const offersBuilder = createMockQueryBuilder({
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
          applications: { job_id: "job-1" },
        },
      ],
    });
    const supabase = createMockSupabase({ offers: offersBuilder });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/analytics/export/route");
    const res = await GET(
      new Request(
        "http://localhost/api/analytics/export?metric=offer_outcomes&jobId=job-1&dateFrom=2026-04-01",
      ) as never,
    );

    expect(res.status).toBe(200);
    expect(offersBuilder.eq).toHaveBeenCalledWith("applications.job_id", "job-1");
    expect(offersBuilder.gte).toHaveBeenCalledWith("sent_at", "2026-04-01");
    expect(res.headers.get("content-disposition")).toContain("analytics-offer_outcomes.csv");
    const csv = await res.text();
    expect(csv).toContain("total_offers");
    expect(csv).toContain("accepted_count");
  });

  it("exports recruiter productivity metric as csv", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const jobsBuilder = createMockQueryBuilder({
      data: [{ id: "job-1", assigned_recruiter_id: "r1", created_by: "r1" }],
    });
    const profilesBuilder = createMockQueryBuilder({
      data: [{ id: "r1", full_name: "Recruiter One" }],
    });
    const appsBuilder = createMockQueryBuilder({
      data: [{ id: "a1", status: "hired", job_id: "job-1" }],
    });
    const pipelineBuilder = createMockQueryBuilder({
      data: [{ id: "pc1", interview_scheduled_at: "2026-04-02T00:00:00Z", job_id: "job-1" }],
    });
    const supabase = createMockSupabase({
      jobs: jobsBuilder,
      profiles: profilesBuilder,
      applications: appsBuilder,
      pipeline_candidates: pipelineBuilder,
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/analytics/export/route");
    const res = await GET(
      new Request("http://localhost/api/analytics/export?metric=recruiter_productivity") as never,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain(
      "analytics-recruiter_productivity.csv",
    );
    const csv = await res.text();
    expect(csv).toContain("recruiter_name");
    expect(csv).toContain("Recruiter One");
  });

  it("exports cost per hire metric as csv", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const costsBuilder = createMockQueryBuilder({
      data: [
        { amount_usd: 100, status: "estimated" },
        { amount_usd: 40, status: "invoiced" },
      ],
    });
    const hiredBuilder = createMockQueryBuilder({ count: 2 });
    const supabase = createMockSupabase({
      platform_cost_events: costsBuilder,
      applications: hiredBuilder,
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/analytics/export/route");
    const res = await GET(
      new Request(
        "http://localhost/api/analytics/export?metric=cost_per_hire&jobId=job-1",
      ) as never,
    );

    expect(res.status).toBe(200);
    expect(hiredBuilder.eq).toHaveBeenCalledWith("job_id", "job-1");
    expect(res.headers.get("content-disposition")).toContain("analytics-cost_per_hire.csv");
    const csv = await res.text();
    expect(csv).toContain("cost_per_hire_usd");
  });
});

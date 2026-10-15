import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockQueryBuilder } from "../helpers";

const mockGetAuthContext = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => Boolean(ctx),
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  jsonError: (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), { status }),
  jsonSuccess: (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), { status }),
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), { status: 500 }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

describe("GET /api/usage/summary", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockFrom.mockReset();
  });

  it("returns usage summary for recruiter using head+exact counts (no 1000-row cap)", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "user-1",
      organisationId: "org-1",
      role: "recruiter",
    });

    // Counts above the PostgREST page size (~1000) prove we read `count`,
    // not the length of a capped data array.
    const jobsBuilder = createMockQueryBuilder({ count: 1500 });
    const candidatesBuilder = createMockQueryBuilder({ count: 2500 });
    const fitsBuilder = createMockQueryBuilder({ count: 4200 });

    mockFrom.mockImplementation((table: string) => {
      if (table === "jobs") return jobsBuilder;
      if (table === "candidates") return candidatesBuilder;
      if (table === "fit_scores") return fitsBuilder;
      return null;
    });

    const { GET } = await import("@/app/api/usage/summary/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobsCount).toBe(1500);
    expect(body.candidatesProcessed).toBe(2500);
    expect(body.fitScoresComputed).toBe(4200);

    expect(jobsBuilder.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    // Distinct candidates come from an inner join through candidate_unlocks.
    expect(candidatesBuilder.select).toHaveBeenCalledWith(
      "id, candidate_unlocks!inner(organisation_id)",
      { count: "exact", head: true },
    );
    expect(candidatesBuilder.eq).toHaveBeenCalledWith("candidate_unlocks.organisation_id", "org-1");
    expect(fitsBuilder.select).toHaveBeenCalledWith("id, jobs!inner(organisation_id)", {
      count: "exact",
      head: true,
    });
    expect(fitsBuilder.eq).toHaveBeenCalledWith("jobs.organisation_id", "org-1");
    expect(fitsBuilder.or).toHaveBeenCalledWith("is_test_run.eq.false,is_test_run.is.null");
  });

  it("returns platform-wide head+exact counts for super_admin", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "admin-1",
      organisationId: null,
      role: "super_admin",
    });

    const jobsBuilder = createMockQueryBuilder({ count: 9000 });
    const candidatesBuilder = createMockQueryBuilder({ count: 12000 });
    const fitsBuilder = createMockQueryBuilder({ count: 34000 });

    mockFrom.mockImplementation((table: string) => {
      if (table === "jobs") return jobsBuilder;
      if (table === "candidates") return candidatesBuilder;
      if (table === "fit_scores") return fitsBuilder;
      return null;
    });

    const { GET } = await import("@/app/api/usage/summary/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.organisationId).toBe("all");
    expect(body.jobsCount).toBe(9000);
    expect(body.candidatesProcessed).toBe(12000);
    expect(body.fitScoresComputed).toBe(34000);

    expect(jobsBuilder.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(candidatesBuilder.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(fitsBuilder.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
  });
});

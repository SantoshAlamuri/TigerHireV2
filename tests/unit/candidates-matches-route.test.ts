import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { candidateCtx, createMockSupabase, createMockQueryBuilder } from "../helpers";

const mockGetAuthContext = vi.fn();
const mockClaimUnclaimedCandidateByEmail = vi.fn();

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
  handleApiError: (err: unknown, _msg: string) =>
    new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("@/lib/agents/candidate-dedup", () => ({
  claimUnclaimedCandidateByEmail: (...args: unknown[]) =>
    mockClaimUnclaimedCandidateByEmail(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const mockCreateSupabaseServerClient = vi.fn();
const mockCreateSupabaseAdmin = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockCreateSupabaseAdmin(),
}));

vi.mock("@/lib/config/env", () => ({
  env: {
    hiddenPublicJobOrgSlugs: ["hidden-org-slug"],
  },
}));

describe("GET /api/candidates/matches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue(candidateCtx);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/candidates/matches/route");
    const req = new NextRequest("http://localhost/api/candidates/matches");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not candidate role", async () => {
    mockGetAuthContext.mockResolvedValue({
      ...candidateCtx,
      role: "recruiter",
    });
    const { GET } = await import("@/app/api/candidates/matches/route");
    const req = new NextRequest("http://localhost/api/candidates/matches");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns 200 with empty matches and message when no candidate profile", async () => {
    const candidateBuilder = createMockQueryBuilder({ data: null });
    const supabase = createMockSupabase({ candidates: candidateBuilder });
    supabase.auth = {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    } as never;
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);
    mockClaimUnclaimedCandidateByEmail.mockResolvedValue(undefined);

    const candidateAfterClaim = createMockQueryBuilder({ data: null });
    const supabase2 = createMockSupabase({
      candidates: candidateAfterClaim,
    });
    supabase2.auth = {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    } as never;
    mockCreateSupabaseServerClient.mockResolvedValue(supabase2);

    const { GET } = await import("@/app/api/candidates/matches/route");
    const req = new NextRequest("http://localhost/api/candidates/matches");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matches).toEqual([]);
    expect(body.message).toContain("profile");
  });

  it("returns 200 with matches when candidate exists and has fit_scores", async () => {
    const candidateBuilder = createMockQueryBuilder({
      data: { id: "cand-1" },
    });
    const matchesBuilder = createMockQueryBuilder({
      data: [
        {
          id: "fs-1",
          candidate_id: "cand-1",
          job_id: "job-1",
          overall_score: 85,
          jobs: { id: "job-1", title: "Engineer" },
        },
      ],
      count: 1,
    });
    const supabase = createMockSupabase({
      candidates: candidateBuilder,
      fit_scores: matchesBuilder,
    });
    supabase.auth = {
      getUser: vi.fn().mockResolvedValue({ data: { user: {} } }),
    } as never;
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/candidates/matches/route");
    const req = new NextRequest("http://localhost/api/candidates/matches");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matches).toBeDefined();
    expect(Array.isArray(body.matches)).toBe(true);
    expect(body.tier).toBe(candidateCtx.role);
    expect(matchesBuilder.is).toHaveBeenCalledWith("superseded_at", null);
  });

  it("returns 500 when matches query fails", async () => {
    mockGetAuthContext.mockResolvedValue({
      ...candidateCtx,
      role: "candidate_pro",
    });
    const candidateBuilder = createMockQueryBuilder({
      data: { id: "cand-1" },
    });
    const matchesBuilder = createMockQueryBuilder({
      data: null,
      error: { message: "query failed" },
    });
    const supabase = createMockSupabase({
      candidates: candidateBuilder,
      fit_scores: matchesBuilder,
    });
    supabase.auth = {
      getUser: vi.fn().mockResolvedValue({ data: { user: {} } }),
    } as never;
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/candidates/matches/route");
    const req = new NextRequest("http://localhost/api/candidates/matches");
    const res = await GET(req);
    expect(res.status).toBe(500);
  });

  it("open_only browse applies hidden-org filter, search, and matched counts (candidate_pro)", async () => {
    mockGetAuthContext.mockResolvedValue({
      ...candidateCtx,
      role: "candidate_pro",
    });
    const candidateBuilder = createMockQueryBuilder({
      data: { id: "cand-1" },
    });
    const orgsBuilder = createMockQueryBuilder({
      data: [{ id: "org-hidden-1" }],
    });
    const matchRow = {
      id: "fs-1",
      candidate_id: "cand-1",
      job_id: "job-1",
      overall_score: 90,
      jobs: {
        id: "job-1",
        title: "Engineer",
        description: "Build things",
        organisation_id: "org-1",
      },
    };
    const mainMatchesBuilder = createMockQueryBuilder({
      data: [matchRow],
      count: 1,
    });
    const poolCountsBuilder = createMockQueryBuilder({
      data: [{ job_id: "job-1" }, { job_id: "job-1" }],
    });
    let fitScoresCalls = 0;
    const supabase = createMockSupabase({
      candidates: candidateBuilder,
      organisations: orgsBuilder,
      fit_scores: mainMatchesBuilder,
    });
    supabase.from = vi.fn((table: string) => {
      if (table === "fit_scores") {
        fitScoresCalls += 1;
        return fitScoresCalls === 1 ? mainMatchesBuilder : poolCountsBuilder;
      }
      if (table === "candidates") return candidateBuilder;
      if (table === "organisations") return orgsBuilder;
      return mainMatchesBuilder;
    }) as never;
    supabase.auth = {
      getUser: vi.fn().mockResolvedValue({ data: { user: {} } }),
    } as never;
    mockCreateSupabaseAdmin.mockReturnValue({});
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/candidates/matches/route");
    const req = new NextRequest(
      "http://localhost/api/candidates/matches?open_only=true&search=eng",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.open_only).toBe(true);
    expect(body.matches).toHaveLength(1);
    const job = body.matches[0].jobs as Record<string, unknown>;
    expect(job.matched_count).toBe(2);
    expect(orgsBuilder.in).toHaveBeenCalledWith("slug", ["hidden-org-slug"]);
  });

  it("returns handleApiError response when supabase client fails", async () => {
    mockGetAuthContext.mockResolvedValue({
      ...candidateCtx,
      role: "candidate_pro",
    });
    mockCreateSupabaseServerClient.mockRejectedValue(new Error("client boom"));

    const { GET } = await import("@/app/api/candidates/matches/route");
    const req = new NextRequest("http://localhost/api/candidates/matches");
    const res = await GET(req);
    expect(res.status).toBe(500);
  });

  it("candidate_free masks compensation in matches payload", async () => {
    const candidateBuilder = createMockQueryBuilder({
      data: { id: "cand-1" },
    });
    const matchesBuilder = createMockQueryBuilder({
      data: [
        {
          id: "fs-1",
          candidate_id: "cand-1",
          job_id: "job-1",
          overall_score: 88,
          jobs: {
            id: "job-1",
            title: "Role",
            compensation_min: 100,
            compensation_max: 200,
          },
        },
      ],
      count: 5,
    });
    const supabase = createMockSupabase({
      candidates: candidateBuilder,
      fit_scores: matchesBuilder,
    });
    supabase.auth = {
      getUser: vi.fn().mockResolvedValue({ data: { user: {} } }),
    } as never;
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/candidates/matches/route");
    const req = new NextRequest("http://localhost/api/candidates/matches?page=2&limit=20");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination).toEqual({ page: 1, limit: 3, total: 5, totalPages: 1 });
    const job = body.matches[0].jobs as Record<string, unknown>;
    expect(job.compensation_min).toBeNull();
    expect(job.compensation_max).toBeNull();
    expect(body.matches[0].overall_score).toBe(88);
  });
});

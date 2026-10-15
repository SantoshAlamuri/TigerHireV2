import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { recruiterCtx, candidateCtx, companyAdminCtx, hiringManagerCtx } from "../helpers";

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

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

function supabaseChain(resolved: { data: unknown; error?: unknown }) {
  const result = Promise.resolve(resolved);
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "in", "or", "order", "limit"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockResolvedValue(resolved);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolved);
  chain.then = (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    result.then(onFulfilled, onRejected);
  return chain;
}

const fullScore = {
  id: "fs-1",
  overall_score: 85,
  job_id: "job-1",
  candidate_id: "c-1",
  created_at: "2024-01-01",
  signal_score: 80,
  grade_based_score: 90,
  candidates: { id: "c-1", name: "Alice", skills: ["Python"], location: "Mumbai" },
  jobs: {
    id: "job-1",
    title: "Engineer",
    organisation_id: "org-1",
    hiring_manager_id: "user-hm-1",
  },
};

describe("GET /api/fit-score/[id]", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAuthContext.mockReset();
    mockServerFrom.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/fit-score/[id]/route");
    const req = new NextRequest("http://localhost/api/fit-score/fs-1");
    const res = await GET(req, { params: Promise.resolve({ id: "fs-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when score not found", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockServerFrom.mockReturnValue(
      supabaseChain({ data: null, error: { code: "PGRST116", message: "not found" } }),
    );
    const { GET } = await import("@/app/api/fit-score/[id]/route");
    const req = new NextRequest("http://localhost/api/fit-score/fs-999");
    const res = await GET(req, { params: Promise.resolve({ id: "fs-999" }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 when recruiter accesses score from different org", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx); // org-1
    const scoreOtherOrg = {
      ...fullScore,
      jobs: { id: "job-1", title: "Engineer", organisation_id: "org-other" },
    };
    mockServerFrom.mockReturnValue(supabaseChain({ data: scoreOtherOrg, error: null }));
    const { GET } = await import("@/app/api/fit-score/[id]/route");
    const req = new NextRequest("http://localhost/api/fit-score/fs-1");
    const res = await GET(req, { params: Promise.resolve({ id: "fs-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 with full score for recruiter in same org", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx); // org-1
    mockServerFrom.mockReturnValue(supabaseChain({ data: fullScore, error: null }));
    const { GET } = await import("@/app/api/fit-score/[id]/route");
    const req = new NextRequest("http://localhost/api/fit-score/fs-1");
    const res = await GET(req, { params: Promise.resolve({ id: "fs-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.score).toEqual(fullScore);
    // Full score should include all fields
    expect(body.score.signal_score).toBe(80);
  });

  it("returns 200 with limited score for free candidate", async () => {
    const freeCandidateCtx = {
      userId: "user-candidate-1",
      role: "candidate_free",
      organisationId: null,
    };
    mockGetAuthContext.mockResolvedValue(freeCandidateCtx);

    // First from("fit_scores") call returns the score
    const fitScoreChain = supabaseChain({ data: fullScore, error: null });
    // Second from("candidates") call returns the candidate profile
    const candidateChain = supabaseChain({
      data: { user_id: "user-candidate-1" },
      error: null,
    });

    mockServerFrom.mockImplementation((table: string) => {
      if (table === "fit_scores") return fitScoreChain;
      if (table === "candidates") return candidateChain;
      return supabaseChain({ data: null, error: null });
    });

    const { GET } = await import("@/app/api/fit-score/[id]/route");
    const req = new NextRequest("http://localhost/api/fit-score/fs-1");
    const res = await GET(req, { params: Promise.resolve({ id: "fs-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    // Free candidate sees only limited fields
    expect(body.score.overall_score).toBe(85);
    expect(body.score.id).toBe("fs-1");
    expect(body.score.signal_score).toBeUndefined();
    expect(body.score.grade_based_score).toBeUndefined();
  });

  it("returns 403 when candidate accesses another candidates score", async () => {
    const freeCandidateCtx = {
      userId: "user-candidate-1",
      role: "candidate_free",
      organisationId: null,
    };
    mockGetAuthContext.mockResolvedValue(freeCandidateCtx);

    const fitScoreChain = supabaseChain({ data: fullScore, error: null });
    // candidate profile belongs to a different user
    const candidateChain = supabaseChain({
      data: { user_id: "user-someone-else" },
      error: null,
    });

    mockServerFrom.mockImplementation((table: string) => {
      if (table === "fit_scores") return fitScoreChain;
      if (table === "candidates") return candidateChain;
      return supabaseChain({ data: null, error: null });
    });

    const { GET } = await import("@/app/api/fit-score/[id]/route");
    const req = new NextRequest("http://localhost/api/fit-score/fs-1");
    const res = await GET(req, { params: Promise.resolve({ id: "fs-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 with full score for leadership in same org", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx); // org-1
    mockServerFrom.mockReturnValue(supabaseChain({ data: fullScore, error: null }));
    const { GET } = await import("@/app/api/fit-score/[id]/route");
    const req = new NextRequest("http://localhost/api/fit-score/fs-1");
    const res = await GET(req, { params: Promise.resolve({ id: "fs-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.score.signal_score).toBe(80);
  });

  it("returns 200 for hiring manager who owns the job", async () => {
    mockGetAuthContext.mockResolvedValue(hiringManagerCtx);
    mockServerFrom.mockReturnValue(supabaseChain({ data: fullScore, error: null }));
    const { GET } = await import("@/app/api/fit-score/[id]/route");
    const req = new NextRequest("http://localhost/api/fit-score/fs-1");
    const res = await GET(req, { params: Promise.resolve({ id: "fs-1" }) });
    expect(res.status).toBe(200);
  });

  it("returns 403 for hiring manager who does not own the job", async () => {
    mockGetAuthContext.mockResolvedValue(hiringManagerCtx);
    const notOwnedScore = {
      ...fullScore,
      jobs: { ...fullScore.jobs, hiring_manager_id: "someone-else" },
    };
    mockServerFrom.mockReturnValue(supabaseChain({ data: notOwnedScore, error: null }));
    const { GET } = await import("@/app/api/fit-score/[id]/route");
    const req = new NextRequest("http://localhost/api/fit-score/fs-1");
    const res = await GET(req, { params: Promise.resolve({ id: "fs-1" }) });
    expect(res.status).toBe(403);
  });
});

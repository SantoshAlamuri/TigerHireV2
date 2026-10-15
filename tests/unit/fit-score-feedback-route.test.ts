import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { recruiterCtx } from "../helpers";

const JOB_ID = "00000000-0000-4000-8000-000000000301";
const CANDIDATE_ID = "00000000-0000-4000-8000-000000000302";
const FIT_SCORE_ID = "00000000-0000-4000-8000-000000000303";

const mockGetAuthContext = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  parseJsonBody: async (request: Request) => {
    const body = await request.json();
    return { body, errorResponse: null };
  },
  jsonError: (msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), { status }),
  jsonSuccess: (data: unknown, status = 200) => new Response(JSON.stringify(data), { status }),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

const mockAssertJobAccess = vi.fn();
vi.mock("@/lib/job-access", () => ({
  assertJobAccess: (...args: unknown[]) => mockAssertJobAccess(...args),
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

function makeChain(resolved: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue({ error: null }),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
  };
  return chain;
}

describe("POST /api/fit-score/feedback", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockAssertJobAccess.mockReset();
    mockFrom.mockReset();
  });

  it("accepts India-SMB reason taxonomy value", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockAssertJobAccess.mockResolvedValue({
      job: { id: JOB_ID, organisation_id: recruiterCtx.organisationId },
    });

    const fitScoreChain = makeChain({
      data: {
        id: FIT_SCORE_ID,
        job_id: JOB_ID,
        candidate_id: CANDIDATE_ID,
        overall_score: 67,
        primary_score: 70,
        scoring_version: 2,
      },
      error: null,
    });
    const existingChain = makeChain({ data: null, error: null });
    const insertChain = makeChain({ data: null, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "fit_scores") return fitScoreChain;
      if (table === "hiring_outcomes") {
        if (existingChain.select.mock.calls.length === 0) return existingChain;
        return insertChain;
      }
      return makeChain({ data: null, error: null });
    });

    const { POST } = await import("@/app/api/fit-score/feedback/route");
    const req = new NextRequest("http://localhost:3000/api/fit-score/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: JOB_ID,
        candidateId: CANDIDATE_ID,
        fitScoreId: FIT_SCORE_ID,
        accuracy: "too_low",
        reason: "salary_expectation_mismatch",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it("rejects invalid reason taxonomy value", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);

    const { POST } = await import("@/app/api/fit-score/feedback/route");
    const req = new NextRequest("http://localhost:3000/api/fit-score/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: JOB_ID,
        candidateId: CANDIDATE_ID,
        fitScoreId: FIT_SCORE_ID,
        accuracy: "too_low",
        reason: "generic_reason",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });
});

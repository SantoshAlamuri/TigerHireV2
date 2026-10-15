import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { candidateCtx, recruiterCtx } from "../helpers";

const mockGetAuthContext = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
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
}));

const mockSupabase = {
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
  }),
};

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(mockSupabase),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe("GET /api/applications/stats", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/applications/stats/route");
    const req = new NextRequest("http://localhost:3000/api/applications/stats");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns stats for candidate", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);

    // Mock applications
    mockSupabase
      .from()
      .select()
      .eq()
      .order.mockResolvedValueOnce({
        data: [
          {
            id: "app-1",
            status: "applied",
            created_at: "2024-01-01T00:00:00Z",
            viewed_at: "2024-01-02T00:00:00Z",
            fit_score_id: "score-1",
          },
          {
            id: "app-2",
            status: "shortlisted",
            created_at: "2024-01-03T00:00:00Z",
            viewed_at: null,
            fit_score_id: "score-2",
          },
        ],
        error: null,
      });

    // Mock fit scores
    mockSupabase
      .from()
      .select()
      .eq()
      .or.mockResolvedValueOnce({
        data: [{ overall_score: 85 }, { overall_score: 90 }],
        error: null,
      });

    const { GET } = await import("@/app/api/applications/stats/route");
    const req = new NextRequest("http://localhost:3000/api/applications/stats");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.byStatus).toEqual({ applied: 1, shortlisted: 1 });
    expect(body.viewedCount).toBe(1);
    expect(body.responseRate).toBe(50);
    expect(body.avgFitScore).toBe(88);
    expect(body.highestScore).toBe(90);
  });

  it("handles empty applications", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    mockSupabase.from().select().eq().order.mockResolvedValueOnce({
      data: [],
      error: null,
    });
    mockSupabase.from().select().eq().or.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    const { GET } = await import("@/app/api/applications/stats/route");
    const req = new NextRequest("http://localhost:3000/api/applications/stats");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(0);
    expect(body.avgFitScore).toBeNull();
    expect(body.highestScore).toBeNull();
  });
});

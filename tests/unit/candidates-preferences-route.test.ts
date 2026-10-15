import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { candidateCtx, recruiterCtx, createMockSupabase, createMockQueryBuilder } from "../helpers";

const mockGetAuthContext = vi.fn();
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
      { status: 422, headers: { "Content-Type": "application/json" } },
    ),
  handleApiError: (err: unknown, _msg: string) =>
    new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

const mockCreateSupabaseServerClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

vi.mock("@/lib/security/csrf", () => ({ validateOrigin: () => null }));

const mockGetCandidatePreferences = vi.fn();
const mockUpsertCandidatePreferences = vi.fn();
vi.mock("@/lib/preferences/get-preferences", () => ({
  getCandidatePreferences: (...args: unknown[]) => mockGetCandidatePreferences(...args),
  upsertCandidatePreferences: (...args: unknown[]) => mockUpsertCandidatePreferences(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const CANDIDATE_ID = "00000000-1111-4000-8000-000000000001";

describe("GET /api/candidates/me/preferences", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/candidates/me/preferences/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { GET } = await import("@/app/api/candidates/me/preferences/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 200 with null preferences when no candidate profile", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);

    const candidatesBuilder = createMockQueryBuilder({ data: null });
    const supabase = createMockSupabase({ candidates: candidatesBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/candidates/me/preferences/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.preferences).toBeNull();
  });

  it("returns 200 with preferences for candidate", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);

    const candidatesBuilder = createMockQueryBuilder({ data: { id: CANDIDATE_ID } });
    const supabase = createMockSupabase({ candidates: candidatesBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const prefs = {
      preferred_locations: ["Bangalore", "Mumbai"],
      remote_preference: "hybrid",
      salary_min_lpa: 15,
      salary_max_lpa: 30,
    };
    mockGetCandidatePreferences.mockResolvedValue(prefs);

    const { GET } = await import("@/app/api/candidates/me/preferences/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.preferences).toEqual(prefs);
  });

  it("returns 500 when getCandidatePreferences throws", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);

    const candidatesBuilder = createMockQueryBuilder({ data: { id: CANDIDATE_ID } });
    const supabase = createMockSupabase({ candidates: candidatesBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    mockGetCandidatePreferences.mockRejectedValue(new Error("DB error"));

    const { GET } = await import("@/app/api/candidates/me/preferences/route");
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("PATCH /api/candidates/me/preferences", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function makeRequest(body: unknown) {
    return new NextRequest("http://localhost:3000/api/candidates/me/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/candidates/me/preferences/route");
    const res = await PATCH(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { PATCH } = await import("@/app/api/candidates/me/preferences/route");
    const res = await PATCH(makeRequest({}));
    expect(res.status).toBe(403);
  });

  it("returns 404 when candidate profile not found", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);

    const candidatesBuilder = createMockQueryBuilder({ data: null });
    const supabase = createMockSupabase({ candidates: candidatesBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { PATCH } = await import("@/app/api/candidates/me/preferences/route");
    const res = await PATCH(makeRequest({ remote_preference: "remote" }));
    expect(res.status).toBe(404);
  });

  it("returns 422 for invalid body (unknown keys in strict schema)", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);

    const candidatesBuilder = createMockQueryBuilder({ data: { id: CANDIDATE_ID } });
    const supabase = createMockSupabase({ candidates: candidatesBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { PATCH } = await import("@/app/api/candidates/me/preferences/route");
    const res = await PATCH(makeRequest({ invalid_field: "value", remote_preference: "remote" }));
    // .strict() schema rejects unknown keys with a 422
    expect(res.status).toBe(422);
  });

  it("returns 422 for invalid enum value", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);

    const candidatesBuilder = createMockQueryBuilder({ data: { id: CANDIDATE_ID } });
    const supabase = createMockSupabase({ candidates: candidatesBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { PATCH } = await import("@/app/api/candidates/me/preferences/route");
    const res = await PATCH(makeRequest({ remote_preference: "invalid_value" }));
    expect(res.status).toBe(422);
  });

  it("clears saved ranges and selections without losing unrelated preferences", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    mockCreateSupabaseServerClient.mockResolvedValue(
      createMockSupabase({
        candidates: createMockQueryBuilder({ data: { id: CANDIDATE_ID } }),
      }),
    );
    mockGetCandidatePreferences.mockResolvedValue({
      remote_preference: "hybrid",
      preferred_seniority: ["Senior"],
      salary_min_lpa: 20,
      salary_max_lpa: 30,
    });
    const { PATCH } = await import("@/app/api/candidates/me/preferences/route");
    const res = await PATCH(
      makeRequest({ preferred_seniority: [], salary_min_lpa: null, salary_max_lpa: null }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).preferences).toEqual({
      remote_preference: "hybrid",
      preferred_seniority: [],
      salary_min_lpa: null,
      salary_max_lpa: null,
    });
  });

  it("validates a partial salary update against the saved minimum", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    mockCreateSupabaseServerClient.mockResolvedValue(
      createMockSupabase({
        candidates: createMockQueryBuilder({ data: { id: CANDIDATE_ID } }),
      }),
    );
    mockGetCandidatePreferences.mockResolvedValue({ salary_min_lpa: 20 });
    const { PATCH } = await import("@/app/api/candidates/me/preferences/route");
    const res = await PATCH(makeRequest({ salary_max_lpa: 10 }));
    expect(res.status).toBe(422);
    expect(mockUpsertCandidatePreferences).not.toHaveBeenCalled();
  });

  it("returns 200 and merges preferences on valid update", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);

    const candidatesBuilder = createMockQueryBuilder({ data: { id: CANDIDATE_ID } });
    const supabase = createMockSupabase({ candidates: candidatesBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const existingPrefs = {
      preferred_locations: ["Delhi"],
      remote_preference: "onsite" as const,
      salary_min_lpa: 10,
    };
    mockGetCandidatePreferences.mockResolvedValue(existingPrefs);
    mockUpsertCandidatePreferences.mockResolvedValue(undefined);

    const { PATCH } = await import("@/app/api/candidates/me/preferences/route");
    const res = await PATCH(makeRequest({ remote_preference: "hybrid", salary_max_lpa: 40 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Merge: existing + incoming
    expect(body.preferences.preferred_locations).toEqual(["Delhi"]);
    expect(body.preferences.remote_preference).toBe("hybrid");
    expect(body.preferences.salary_min_lpa).toBe(10);
    expect(body.preferences.salary_max_lpa).toBe(40);
    expect(mockUpsertCandidatePreferences).toHaveBeenCalledWith(
      expect.anything(),
      CANDIDATE_ID,
      expect.objectContaining({ remote_preference: "hybrid", salary_max_lpa: 40 }),
    );
  });

  it("returns 500 on DB error during upsert", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);

    const candidatesBuilder = createMockQueryBuilder({ data: { id: CANDIDATE_ID } });
    const supabase = createMockSupabase({ candidates: candidatesBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    mockGetCandidatePreferences.mockResolvedValue({});
    mockUpsertCandidatePreferences.mockRejectedValue(new Error("DB write error"));

    const { PATCH } = await import("@/app/api/candidates/me/preferences/route");
    const res = await PATCH(makeRequest({ remote_preference: "remote" }));
    expect(res.status).toBe(500);
  });
});

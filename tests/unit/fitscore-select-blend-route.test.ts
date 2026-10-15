import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { recruiterCtx, candidateCtx, hiringManagerCtx, companyAdminCtx } from "../helpers";

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
          headers: { "Content-Type": "application/json" },
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
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
  apiLogContext: (route: string, _ctx: unknown) => ({ route }),
  reportError: vi.fn(),
}));

const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ from: (...args: unknown[]) => mockAdminFrom(...args) }),
}));

const mockServerFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({ from: (...args: unknown[]) => mockServerFrom(...args) }),
}));

const mockAssertJobAccess = vi.fn();
vi.mock("@/lib/job-access", () => ({
  assertJobAccess: (...args: unknown[]) => mockAssertJobAccess(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

function supabaseChain(resolved: { data: unknown; error?: unknown }) {
  const result = Promise.resolve(resolved);
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "in", "is", "or", "order", "limit", "update"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockResolvedValue(resolved);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolved);
  chain.then = (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    result.then(onFulfilled, onRejected);
  return chain;
}

describe("POST /api/fitscore/select-blend", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAuthContext.mockReset();
    mockAdminFrom.mockReset();
    mockServerFrom.mockReset();
    mockAssertJobAccess.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/fitscore/select-blend/route");
    const req = new NextRequest("http://localhost/api/fitscore/select-blend", {
      method: "POST",
      body: JSON.stringify({ candidate_id: "c-1", job_id: "j-1", selection: "primary" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for candidate_free role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { POST } = await import("@/app/api/fitscore/select-blend/route");
    const req = new NextRequest("http://localhost/api/fitscore/select-blend", {
      method: "POST",
      body: JSON.stringify({ candidate_id: "c-1", job_id: "j-1", selection: "primary" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 403 for hiring_manager role", async () => {
    mockGetAuthContext.mockResolvedValue(hiringManagerCtx);
    const { POST } = await import("@/app/api/fitscore/select-blend/route");
    const req = new NextRequest("http://localhost/api/fitscore/select-blend", {
      method: "POST",
      body: JSON.stringify({ candidate_id: "c-1", job_id: "j-1", selection: "primary" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 422 when candidate_id is missing", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/fitscore/select-blend/route");
    const req = new NextRequest("http://localhost/api/fitscore/select-blend", {
      method: "POST",
      body: JSON.stringify({ job_id: "j-1", selection: "primary" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain("expected string");
  });

  it("returns 422 when selection is invalid", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/fitscore/select-blend/route");
    const req = new NextRequest("http://localhost/api/fitscore/select-blend", {
      method: "POST",
      body: JSON.stringify({ candidate_id: "c-1", job_id: "j-1", selection: "tertiary" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain("Invalid option");
  });

  it("returns 400 for malformed JSON", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/fitscore/select-blend/route");
    const req = new NextRequest("http://localhost/api/fitscore/select-blend", {
      method: "POST",
      body: "{",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 404 when fit score not found", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockAdminFrom.mockReturnValue(supabaseChain({ data: null, error: null }));
    const { POST } = await import("@/app/api/fitscore/select-blend/route");
    const req = new NextRequest("http://localhost/api/fitscore/select-blend", {
      method: "POST",
      body: JSON.stringify({ candidate_id: "c-1", job_id: "j-1", selection: "primary" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("returns 200 when primary blend is selected", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const fitScore = {
      id: "fs-1",
      overall_score: 85,
      primary_score: 82,
      shadow_score: 78,
      signal_score: 70,
      grade_based_score: 90,
      job_id: "j-1",
      jobs: { organisation_id: "org-1" },
    };

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "fit_scores") {
        // First call: select (returns score), second call: update
        return supabaseChain({ data: fitScore, error: null });
      }
      return supabaseChain({ data: null, error: null });
    });

    mockAssertJobAccess.mockResolvedValue({ job: { id: "j-1", organisation_id: "org-1" } });

    const { POST } = await import("@/app/api/fitscore/select-blend/route");
    const req = new NextRequest("http://localhost/api/fitscore/select-blend", {
      method: "POST",
      body: JSON.stringify({ candidate_id: "c-1", job_id: "j-1", selection: "primary" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.selection).toBe("primary");
    expect(body.displayed_score).toBe(82); // primary_score
  });

  it("filters active row and updates by fit_score id only", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const fitScore = {
      id: "fs-1",
      overall_score: 85,
      primary_score: 82,
      shadow_score: 78,
      signal_score: 70,
      grade_based_score: 90,
      job_id: "j-1",
      jobs: { organisation_id: "org-1" },
    };
    const fetchChain = supabaseChain({ data: fitScore, error: null });
    const updateChain = supabaseChain({ data: null, error: null });
    mockAdminFrom
      .mockImplementationOnce(() => fetchChain)
      .mockImplementationOnce(() => updateChain);
    mockAssertJobAccess.mockResolvedValue({ job: { id: "j-1", organisation_id: "org-1" } });

    const { POST } = await import("@/app/api/fitscore/select-blend/route");
    const req = new NextRequest("http://localhost/api/fitscore/select-blend", {
      method: "POST",
      body: JSON.stringify({ candidate_id: "c-1", job_id: "j-1", selection: "primary" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(fetchChain.is as ReturnType<typeof vi.fn>).toHaveBeenCalledWith("superseded_at", null);
    expect(updateChain.eq as ReturnType<typeof vi.fn>).toHaveBeenCalledWith("id", "fs-1");
  });

  it("returns 200 when shadow blend is selected", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    const fitScore = {
      id: "fs-1",
      overall_score: 85,
      primary_score: 82,
      shadow_score: 78,
      signal_score: 70,
      grade_based_score: 90,
      job_id: "j-1",
      jobs: { organisation_id: "org-1" },
    };

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "fit_scores") {
        return supabaseChain({ data: fitScore, error: null });
      }
      return supabaseChain({ data: null, error: null });
    });

    mockAssertJobAccess.mockResolvedValue({ job: { id: "j-1", organisation_id: "org-1" } });

    const { POST } = await import("@/app/api/fitscore/select-blend/route");
    const req = new NextRequest("http://localhost/api/fitscore/select-blend", {
      method: "POST",
      body: JSON.stringify({ candidate_id: "c-1", job_id: "j-1", selection: "shadow" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.selection).toBe("shadow");
    expect(body.displayed_score).toBe(78); // shadow_score
  });

  it("returns 403 when recruiter has no access to the job", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const fitScore = {
      id: "fs-1",
      overall_score: 85,
      primary_score: 82,
      shadow_score: null,
      signal_score: null,
      grade_based_score: null,
      job_id: "j-1",
      jobs: { organisation_id: "org-other" },
    };

    mockAdminFrom.mockReturnValue(supabaseChain({ data: fitScore, error: null }));
    mockAssertJobAccess.mockResolvedValue({ job: null });

    const { POST } = await import("@/app/api/fitscore/select-blend/route");
    const req = new NextRequest("http://localhost/api/fitscore/select-blend", {
      method: "POST",
      body: JSON.stringify({ candidate_id: "c-1", job_id: "j-1", selection: "primary" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 500 when admin fetch fails", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockAdminFrom.mockReturnValue(supabaseChain({ data: null, error: { message: "db error" } }));
    const { POST } = await import("@/app/api/fitscore/select-blend/route");
    const req = new NextRequest("http://localhost/api/fitscore/select-blend", {
      method: "POST",
      body: JSON.stringify({ candidate_id: "c-1", job_id: "j-1", selection: "primary" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it("recomputes band from the selected shadow score using default thresholds", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const fitScore = {
      id: "fs-1",
      overall_score: 82,
      primary_score: 82,
      shadow_score: 45,
      signal_score: null,
      grade_based_score: null,
      rubric_snapshot: null,
      job_id: "j-1",
      jobs: { organisation_id: "org-1" },
    };
    const fetchChain = supabaseChain({ data: fitScore, error: null });
    const updateChain = supabaseChain({ data: null, error: null });
    mockAdminFrom
      .mockImplementationOnce(() => fetchChain)
      .mockImplementationOnce(() => updateChain);
    mockAssertJobAccess.mockResolvedValue({ job: { id: "j-1", organisation_id: "org-1" } });

    const { POST } = await import("@/app/api/fitscore/select-blend/route");
    const req = new NextRequest("http://localhost/api/fitscore/select-blend", {
      method: "POST",
      body: JSON.stringify({ candidate_id: "c-1", job_id: "j-1", selection: "shadow" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    // 45 falls in the default Moderate band (40–59)
    expect(updateChain.update as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.objectContaining({ overall_score: 45, band: "Moderate Fit" }),
    );
    const body = await res.json();
    expect(body.band).toBe("Moderate Fit");
  });

  it("recomputes band when reverting to primary, using rubric_snapshot thresholds", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const fitScore = {
      id: "fs-1",
      overall_score: 45,
      primary_score: 82,
      shadow_score: 45,
      signal_score: null,
      grade_based_score: null,
      rubric_snapshot: {
        fit_thresholds: { strong: 90, good: 70, moderate: 50, weak: 30 },
      },
      job_id: "j-1",
      jobs: { organisation_id: "org-1" },
    };
    const fetchChain = supabaseChain({ data: fitScore, error: null });
    const updateChain = supabaseChain({ data: null, error: null });
    mockAdminFrom
      .mockImplementationOnce(() => fetchChain)
      .mockImplementationOnce(() => updateChain);
    mockAssertJobAccess.mockResolvedValue({ job: { id: "j-1", organisation_id: "org-1" } });

    const { POST } = await import("@/app/api/fitscore/select-blend/route");
    const req = new NextRequest("http://localhost/api/fitscore/select-blend", {
      method: "POST",
      body: JSON.stringify({ candidate_id: "c-1", job_id: "j-1", selection: "primary" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    // 82 with snapshot thresholds (strong: 90, good: 70) → Good Fit, not the default Strong Fit
    expect(updateChain.update as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.objectContaining({ overall_score: 82, band: "Good Fit" }),
    );
    const body = await res.json();
    expect(body.band).toBe("Good Fit");
  });
});

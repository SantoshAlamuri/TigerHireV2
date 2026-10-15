import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  createMockQueryBuilder,
  createMockSupabase,
  recruiterCtx,
  candidateCtx,
  companyAdminCtx,
  hiringManagerCtx,
} from "../helpers";

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
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }),
  handleZodError: (err: { issues: Array<{ message: string }> }) =>
    new Response(
      JSON.stringify({ error: err.issues.map((e: { message: string }) => e.message).join("; ") }),
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
vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/services/notifications", () => ({
  createNotificationBatch: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/job-access", () => ({
  assertJobAccess: vi.fn().mockResolvedValue({ job: { id: "j1", organisation_id: "org-1" } }),
}));

describe("GET /api/jobs/[id]/feedback", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAuthContext.mockReset();
    mockCreateSupabaseServerClient.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/jobs/[id]/feedback/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback");
    const res = await GET(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { GET } = await import("@/app/api/jobs/[id]/feedback/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback");
    const res = await GET(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 200 with feedback list and aggregations", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const feedbackData = [
      { id: "fb-1", overall_rating: 4, recommendation: "hire", responses: {} },
      { id: "fb-2", overall_rating: 5, recommendation: "strong_hire", responses: {} },
      { id: "fb-3", overall_rating: 3, recommendation: "hire", responses: {} },
    ];
    const feedbackBuilder = createMockQueryBuilder({ data: feedbackData });
    const supabase = createMockSupabase({ feedback_responses: feedbackBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/jobs/[id]/feedback/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback");
    const res = await GET(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.responses).toBeDefined();
    expect(body.aggregate).toBeDefined();
    expect(body.aggregate.count).toBe(3);
    expect(body.aggregate.avgRating).toBe(4);
    expect(body.aggregate.recommendations).toEqual({ hire: 2, strong_hire: 1 });
  });

  it("returns 200 with empty results when no feedback exists", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const feedbackBuilder = createMockQueryBuilder({ data: [] });
    const supabase = createMockSupabase({ feedback_responses: feedbackBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/jobs/[id]/feedback/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback");
    const res = await GET(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.responses).toEqual([]);
    expect(body.aggregate.count).toBe(0);
    expect(body.aggregate.avgRating).toBeNull();
    expect(body.aggregate.recommendations).toEqual({});
  });

  it("returns 500 on database error", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const feedbackBuilder = createMockQueryBuilder({ error: { message: "DB error" } });
    const supabase = createMockSupabase({ feedback_responses: feedbackBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/jobs/[id]/feedback/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback");
    const res = await GET(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(500);
  });

  it("returns 200 for leadership role", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    const feedbackBuilder = createMockQueryBuilder({ data: [] });
    const supabase = createMockSupabase({ feedback_responses: feedbackBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/jobs/[id]/feedback/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback");
    const res = await GET(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(200);
  });

  it("returns 200 for hiring_manager role", async () => {
    mockGetAuthContext.mockResolvedValue(hiringManagerCtx);
    const feedbackBuilder = createMockQueryBuilder({ data: [] });
    const supabase = createMockSupabase({ feedback_responses: feedbackBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/jobs/[id]/feedback/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback");
    const res = await GET(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/jobs/[id]/feedback", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAuthContext.mockReset();
    mockCreateSupabaseServerClient.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/jobs/[id]/feedback/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { POST } = await import("@/app/api/jobs/[id]/feedback/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 422 when template_id is missing", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/jobs/[id]/feedback/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipeline_candidate_id: "pc1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("template_id is required");
  });

  it("returns 400 for malformed JSON body", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/jobs/[id]/feedback/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 422 when pipeline_candidate_id is missing", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/jobs/[id]/feedback/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template_id: "tpl-1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("pipeline_candidate_id is required");
  });

  it("returns 422 for overall_rating below 1", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/jobs/[id]/feedback/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template_id: "tpl-1",
        pipeline_candidate_id: "pc1",
        recommendation: "hire",
        overall_rating: 0,
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("overall_rating must be between 1 and 5");
  });

  it("returns 422 for overall_rating above 5", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/jobs/[id]/feedback/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template_id: "tpl-1",
        pipeline_candidate_id: "pc1",
        recommendation: "hire",
        overall_rating: 6,
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("overall_rating must be between 1 and 5");
  });

  it("returns 422 for invalid recommendation value", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/jobs/[id]/feedback/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template_id: "tpl-1",
        pipeline_candidate_id: "pc1",
        overall_rating: 3,
        recommendation: "maybe",
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Invalid recommendation value");
  });

  it("returns 422 when recommendation is missing (#354)", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/jobs/[id]/feedback/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template_id: "tpl-1",
        pipeline_candidate_id: "pc1",
        overall_rating: 4,
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("recommendation is required");
  });

  it("returns 201 on successful feedback submission", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const feedbackResult = {
      id: "fb-new",
      template_id: "tpl-1",
      job_id: "j1",
      pipeline_candidate_id: "pc1",
      overall_rating: 4,
      recommendation: "hire",
      responses: { "Coding Skills": 5, Communication: 4 },
      notes: "Strong candidate",
    };
    const feedbackBuilder = createMockQueryBuilder({ data: feedbackResult });
    const supabase = createMockSupabase({ feedback_responses: feedbackBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/jobs/[id]/feedback/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template_id: "tpl-1",
        pipeline_candidate_id: "pc1",
        overall_rating: 4,
        recommendation: "hire",
        responses: { "Coding Skills": 5, Communication: 4 },
        notes: "Strong candidate",
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.feedback).toBeDefined();
    expect(body.feedback.id).toBe("fb-new");
  });

  it("returns 500 on database error during submission", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const feedbackBuilder = createMockQueryBuilder({ error: { message: "insert failed" } });
    const supabase = createMockSupabase({ feedback_responses: feedbackBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/jobs/[id]/feedback/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template_id: "tpl-1",
        pipeline_candidate_id: "pc1",
        overall_rating: 4,
        recommendation: "hire",
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to submit feedback");
  });

  it("accepts valid recommendation values: strong_hire, hire, no_hire, strong_no_hire", async () => {
    for (const recommendation of ["strong_hire", "hire", "no_hire", "strong_no_hire"]) {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);
      const feedbackBuilder = createMockQueryBuilder({ data: { id: "fb-x", recommendation } });
      const supabase = createMockSupabase({ feedback_responses: feedbackBuilder });
      mockCreateSupabaseServerClient.mockResolvedValue(supabase);

      const { POST } = await import("@/app/api/jobs/[id]/feedback/route");
      const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: "tpl-1",
          pipeline_candidate_id: "pc1",
          overall_rating: 3,
          recommendation,
        }),
      });
      const res = await POST(req, { params: Promise.resolve({ id: "j1" }) });
      expect(res.status).toBe(201);
    }
  });
});

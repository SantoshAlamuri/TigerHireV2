import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { recruiterCtx, candidateCtx } from "../helpers";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/api-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-helpers")>("@/lib/api-helpers");
  return {
    ...actual,
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
  };
});

const chainMock = (data: unknown = null, error: unknown = null) => {
  const m: Record<string, unknown> = {};
  for (const method of ["select", "insert", "update", "eq", "in", "order"]) {
    m[method] = vi.fn().mockReturnValue(m);
  }
  m.single = vi.fn().mockResolvedValue({ data, error });
  m.maybeSingle = vi.fn().mockResolvedValue({ data, error });
  m.then = vi.fn((resolve: (v: unknown) => void) =>
    resolve({ data: data ? (Array.isArray(data) ? data : [data]) : [], error }),
  );
  return m;
};

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      from: vi.fn().mockReturnValue(chainMock({ id: "tpl-1", name: "Default" })),
    }),
}));

vi.mock("@/lib/job-access", () => ({
  assertJobAccess: vi.fn().mockResolvedValue({
    job: { id: "j1", organisation_id: "org-1", hiring_manager_id: null },
  }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/services/notifications", () => ({
  createNotificationBatch: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/feedback/industry-feedback-template", () => ({
  ensureIndustryFeedbackTemplateForJob: vi.fn().mockResolvedValue(null),
}));

describe("GET /api/jobs/[id]/feedback-templates", () => {
  beforeEach(() => mockGetAuthContext.mockReset());

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/jobs/[id]/feedback-templates/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback-templates");
    const res = await GET(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { GET } = await import("@/app/api/jobs/[id]/feedback-templates/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback-templates");
    const res = await GET(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 for recruiter", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { GET } = await import("@/app/api/jobs/[id]/feedback-templates/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback-templates");
    const res = await GET(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/jobs/[id]/feedback-templates", () => {
  beforeEach(() => mockGetAuthContext.mockReset());

  it("returns 422 when name is missing", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/jobs/[id]/feedback-templates/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: [{ label: "Skills", type: "rating" }] }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(422);
  });

  it("returns 422 when fields are empty", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/jobs/[id]/feedback-templates/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "My Form", fields: [] }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(422);
  });

  it("returns 201 when template is created", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/jobs/[id]/feedback-templates/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Technical Interview",
        fields: [
          { label: "Coding Skills", type: "rating", required: true },
          { label: "Communication", type: "rating", required: true },
        ],
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(201);
  });
});

describe("POST /api/jobs/[id]/feedback", () => {
  beforeEach(() => mockGetAuthContext.mockReset());

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
  });

  it("returns 422 for invalid overall_rating", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/jobs/[id]/feedback/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template_id: "tpl-1",
        pipeline_candidate_id: "pc1",
        overall_rating: 6,
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(422);
  });

  it("returns 201 when feedback is submitted", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
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
  });
});

describe("GET /api/jobs/[id]/feedback", () => {
  beforeEach(() => mockGetAuthContext.mockReset());

  it("returns 200 with aggregated feedback", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { GET } = await import("@/app/api/jobs/[id]/feedback/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback");
    const res = await GET(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.responses).toBeDefined();
    expect(body.aggregate).toBeDefined();
  });
});

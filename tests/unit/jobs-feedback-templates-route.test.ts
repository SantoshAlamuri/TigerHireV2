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
vi.mock("@/lib/feedback/industry-feedback-template", () => ({
  ensureIndustryFeedbackTemplateForJob: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/job-access", () => ({
  assertJobAccess: vi.fn().mockResolvedValue({ job: { id: "j1", organisation_id: "org-1" } }),
}));

describe("GET /api/jobs/[id]/feedback-templates", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAuthContext.mockReset();
    mockCreateSupabaseServerClient.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/jobs/[id]/feedback-templates/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback-templates");
    const res = await GET(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { GET } = await import("@/app/api/jobs/[id]/feedback-templates/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback-templates");
    const res = await GET(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 200 with template list for recruiter", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const templates = [
      {
        id: "tpl-1",
        name: "Technical Interview",
        fields: [{ label: "Coding", type: "rating" }],
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "tpl-2",
        name: "Culture Fit",
        fields: [{ label: "Teamwork", type: "rating" }],
        created_at: "2026-01-02T00:00:00Z",
      },
    ];
    const templateBuilder = createMockQueryBuilder({ data: templates });
    const supabase = createMockSupabase({ feedback_form_templates: templateBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/jobs/[id]/feedback-templates/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback-templates");
    const res = await GET(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.templates).toBeDefined();
    expect(body.templates).toHaveLength(2);
    expect(body.templates[0].name).toBe("Technical Interview");
  });

  it("returns 200 with empty list when no templates exist", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const templateBuilder = createMockQueryBuilder({ data: [] });
    const supabase = createMockSupabase({ feedback_form_templates: templateBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/jobs/[id]/feedback-templates/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback-templates");
    const res = await GET(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.templates).toEqual([]);
  });

  it("returns 500 on database error", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const templateBuilder = createMockQueryBuilder({ error: { message: "DB error" } });
    const supabase = createMockSupabase({ feedback_form_templates: templateBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/jobs/[id]/feedback-templates/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback-templates");
    const res = await GET(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to fetch templates");
  });

  it("returns 200 for leadership role", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    const templateBuilder = createMockQueryBuilder({ data: [] });
    const supabase = createMockSupabase({ feedback_form_templates: templateBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/jobs/[id]/feedback-templates/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback-templates");
    const res = await GET(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(200);
  });

  it("returns 200 for hiring_manager role", async () => {
    mockGetAuthContext.mockResolvedValue(hiringManagerCtx);
    const templateBuilder = createMockQueryBuilder({ data: [] });
    const supabase = createMockSupabase({ feedback_form_templates: templateBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/jobs/[id]/feedback-templates/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback-templates");
    const res = await GET(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/jobs/[id]/feedback-templates", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAuthContext.mockReset();
    mockCreateSupabaseServerClient.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/jobs/[id]/feedback-templates/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", fields: [{ label: "x" }] }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { POST } = await import("@/app/api/jobs/[id]/feedback-templates/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", fields: [{ label: "x" }] }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 422 when name is missing", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/jobs/[id]/feedback-templates/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: [{ label: "Coding", type: "rating" }] }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Template name is required");
  });

  it("returns 422 when name is empty string", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/jobs/[id]/feedback-templates/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "  ", fields: [{ label: "Coding" }] }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Template name is required");
  });

  it("returns 422 when fields is missing", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/jobs/[id]/feedback-templates/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "My Template" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("At least one field is required");
  });

  it("returns 422 when fields array is empty", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/jobs/[id]/feedback-templates/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "My Template", fields: [] }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("At least one field is required");
  });

  it("returns 201 when template is created successfully", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const createdTemplate = {
      id: "tpl-new",
      job_id: "j1",
      name: "Technical Interview",
      fields: [
        { label: "Coding Skills", type: "rating", required: true },
        { label: "Communication", type: "rating", required: true },
      ],
      created_by: recruiterCtx.userId,
    };
    const templateBuilder = createMockQueryBuilder({ data: createdTemplate });
    const supabase = createMockSupabase({ feedback_form_templates: templateBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

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
    const body = await res.json();
    expect(body.template).toBeDefined();
    expect(body.template.id).toBe("tpl-new");
    expect(body.template.name).toBe("Technical Interview");
  });

  it("returns 500 on database error during creation", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const templateBuilder = createMockQueryBuilder({ error: { message: "insert failed" } });
    const supabase = createMockSupabase({ feedback_form_templates: templateBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/jobs/[id]/feedback-templates/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/j1/feedback-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "My Template",
        fields: [{ label: "Skills", type: "rating" }],
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to create template");
  });
});

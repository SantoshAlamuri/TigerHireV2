import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockSupabase,
  createMockQueryBuilder,
  recruiterCtx,
  candidateCtx,
  companyAdminCtx,
  buildRequest,
  fakeUuid,
} from "../helpers";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/api-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-helpers")>("@/lib/api-helpers");
  return {
    ...actual,
    getAuthContext: vi.fn(),
    requireAuth: (ctx: unknown) => ctx !== null,
    hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
    jsonError: (msg: string, status: number) => Response.json({ error: msg }, { status }),
    jsonSuccess: (data: unknown, status = 200) => Response.json(data, { status }),
  };
});

vi.mock("@/lib/job-access", () => ({
  assertJobAccess: vi.fn().mockResolvedValue({
    job: { id: "job1", organisation_id: "org-1", hiring_manager_id: null },
  }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/api-helpers";

const mockCreateSupabase = createSupabaseServerClient as unknown as ReturnType<typeof vi.fn>;
const mockGetAuth = getAuthContext as unknown as ReturnType<typeof vi.fn>;

describe("Feedback Templates + Responses Integration", () => {
  const jobId = fakeUuid("job1");
  const templateId = fakeUuid("tmpl1");
  const pcId = fakeUuid("pc1");

  beforeEach(() => vi.clearAllMocks());

  it("recruiter can create a template, then submit feedback against it", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);

    const templateData = {
      id: templateId,
      job_id: jobId,
      name: "Technical Screen",
      fields: [
        { label: "Coding", type: "rating", required: true },
        { label: "Notes", type: "text", required: false },
      ],
      created_by: recruiterCtx.userId,
    };

    const templateBuilder = createMockQueryBuilder({ data: templateData });
    const supabase = createMockSupabase({
      feedback_form_templates: templateBuilder,
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { POST: createTemplate } = await import("@/app/api/jobs/[id]/feedback-templates/route");
    const createReq = buildRequest(`http://localhost/api/jobs/${jobId}/feedback-templates`, {
      method: "POST",
      body: {
        name: "Technical Screen",
        fields: [
          { label: "Coding", type: "rating", required: true },
          { label: "Notes", type: "text", required: false },
        ],
      },
    });
    const createRes = await createTemplate(createReq as never, {
      params: Promise.resolve({ id: jobId }),
    });
    expect(createRes.status).toBe(201);
    const createJson = await createRes.json();
    expect(createJson.template.name).toBe("Technical Screen");
  });

  it("recruiter can list templates for a job", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);

    const templatesData = [
      { id: templateId, job_id: jobId, name: "Technical Screen" },
      { id: fakeUuid("tmpl2"), job_id: jobId, name: "Culture Fit" },
    ];
    const templateBuilder = createMockQueryBuilder({ data: templatesData });
    const supabase = createMockSupabase({
      feedback_form_templates: templateBuilder,
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/jobs/[id]/feedback-templates/route");
    const res = await GET(
      new Request(`http://localhost/api/jobs/${jobId}/feedback-templates`) as never,
      { params: Promise.resolve({ id: jobId }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.templates).toHaveLength(2);
  });

  it("recruiter can submit feedback for a pipeline candidate", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);

    const feedbackData = {
      id: fakeUuid("fb1"),
      template_id: templateId,
      job_id: jobId,
      pipeline_candidate_id: pcId,
      submitted_by: recruiterCtx.userId,
      overall_rating: 4,
      recommendation: "hire",
      notes: "Strong candidate",
    };

    const responseBuilder = createMockQueryBuilder({ data: feedbackData });
    const supabase = createMockSupabase({
      feedback_responses: responseBuilder,
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/jobs/[id]/feedback/route");
    const req = buildRequest(`http://localhost/api/jobs/${jobId}/feedback`, {
      method: "POST",
      body: {
        template_id: templateId,
        pipeline_candidate_id: pcId,
        overall_rating: 4,
        recommendation: "hire",
        notes: "Strong candidate",
      },
    });
    const res = await POST(req as never, {
      params: Promise.resolve({ id: jobId }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.feedback.overall_rating).toBe(4);
    expect(json.feedback.recommendation).toBe("hire");
  });

  it("feedback GET returns aggregated data", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);

    const feedbackData = [
      {
        id: fakeUuid("fb1"),
        overall_rating: 4,
        recommendation: "hire",
        pipeline_candidate_id: pcId,
      },
      {
        id: fakeUuid("fb2"),
        overall_rating: 3,
        recommendation: "no_hire",
        pipeline_candidate_id: pcId,
      },
      {
        id: fakeUuid("fb3"),
        overall_rating: 5,
        recommendation: "strong_hire",
        pipeline_candidate_id: pcId,
      },
    ];

    const responseBuilder = createMockQueryBuilder({ data: feedbackData });
    const supabase = createMockSupabase({
      feedback_responses: responseBuilder,
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/jobs/[id]/feedback/route");
    const res = await GET(
      new Request(
        `http://localhost/api/jobs/${jobId}/feedback?pipeline_candidate_id=${pcId}`,
      ) as never,
      { params: Promise.resolve({ id: jobId }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.aggregate.count).toBe(3);
    expect(json.aggregate.avgRating).toBe(4);
    expect(json.aggregate.recommendations).toEqual({
      hire: 1,
      no_hire: 1,
      strong_hire: 1,
    });
  });

  it("candidate cannot access feedback routes", async () => {
    mockGetAuth.mockResolvedValue(candidateCtx);

    const { GET } = await import("@/app/api/jobs/[id]/feedback/route");
    const res = await GET(new Request(`http://localhost/api/jobs/${jobId}/feedback`) as never, {
      params: Promise.resolve({ id: jobId }),
    });
    expect(res.status).toBe(403);
  });

  it("leadership can access feedback routes", async () => {
    mockGetAuth.mockResolvedValue(companyAdminCtx);

    const responseBuilder = createMockQueryBuilder({ data: [] });
    const supabase = createMockSupabase({
      feedback_responses: responseBuilder,
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/jobs/[id]/feedback/route");
    const res = await GET(new Request(`http://localhost/api/jobs/${jobId}/feedback`) as never, {
      params: Promise.resolve({ id: jobId }),
    });
    expect(res.status).toBe(200);
  });

  it("rejects invalid overall_rating in feedback submission", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const supabase = createMockSupabase();
    mockCreateSupabase.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/jobs/[id]/feedback/route");
    const req = buildRequest(`http://localhost/api/jobs/${jobId}/feedback`, {
      method: "POST",
      body: {
        template_id: templateId,
        pipeline_candidate_id: pcId,
        overall_rating: 6,
      },
    });
    const res = await POST(req as never, {
      params: Promise.resolve({ id: jobId }),
    });
    expect(res.status).toBe(422);
  });

  it("rejects invalid recommendation value", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const supabase = createMockSupabase();
    mockCreateSupabase.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/jobs/[id]/feedback/route");
    const req = buildRequest(`http://localhost/api/jobs/${jobId}/feedback`, {
      method: "POST",
      body: {
        template_id: templateId,
        pipeline_candidate_id: pcId,
        overall_rating: 4,
        recommendation: "maybe",
      },
    });
    const res = await POST(req as never, {
      params: Promise.resolve({ id: jobId }),
    });
    expect(res.status).toBe(422);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockQueryBuilder, createMockSupabase } from "../helpers";

const mockGetAuthContext = vi.fn();
const mockCreateSupabaseServerClient = vi.fn();
const mockHasAnyEnterpriseRole = vi.fn();
const mockGetOrgSettingsPermissions = vi.fn();
const mockHasSettingsCapability = vi.fn();
const mockCreateNotification = vi.fn();
const mockCreateCodingTestSession = vi.fn();
const mockCreateAssessmentShareToken = vi.fn();
const mockGetAssessmentShareUrl = vi.fn();
const mockSendAssessmentShareMessages = vi.fn();
const mockAutoAdvanceAssessmentStage = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  ensureOrganisationAccess: (
    ctx: { role?: string; organisationId?: string | null },
    resourceOrganisationId: string | null | undefined,
  ) => {
    if (ctx.role === "super_admin") return null;
    if (
      !ctx.organisationId ||
      !resourceOrganisationId ||
      ctx.organisationId !== resourceOrganisationId
    ) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    return null;
  },
  parseJsonBody: async (request: Request) => {
    try {
      const body = await request.json();
      return { body, errorResponse: null };
    } catch {
      return {
        body: null,
        errorResponse: Response.json({ error: "Invalid JSON body" }, { status: 400 }),
      };
    }
  },
  jsonError: (msg: string, status: number) => Response.json({ error: msg }, { status }),
  jsonSuccess: (data: unknown, status = 200) => Response.json(data, { status }),
  handleZodError: () => Response.json({ error: "Invalid request payload" }, { status: 422 }),
  handleApiError: (err: unknown) => Response.json({ error: String(err) }, { status: 500 }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

vi.mock("@/lib/security/enterprise-roles", () => ({
  hasAnyEnterpriseRole: (...args: unknown[]) => mockHasAnyEnterpriseRole(...args),
}));

vi.mock("@/lib/settings/permissions", () => ({
  getOrgSettingsPermissions: (...args: unknown[]) => mockGetOrgSettingsPermissions(...args),
  hasSettingsCapability: (...args: unknown[]) => mockHasSettingsCapability(...args),
}));

vi.mock("@/lib/services/notifications", () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

vi.mock("@/lib/services/assessment-integrations", () => ({
  createCodingTestSession: (...args: unknown[]) => mockCreateCodingTestSession(...args),
}));

vi.mock("@/lib/services/assessment-share", () => ({
  createAssessmentShareToken: () => mockCreateAssessmentShareToken(),
  getAssessmentShareUrl: (...args: unknown[]) => mockGetAssessmentShareUrl(...args),
  sendAssessmentShareMessages: (...args: unknown[]) => mockSendAssessmentShareMessages(...args),
}));

vi.mock("@/lib/assessments/auto-advance", () => ({
  autoAdvanceAssessmentStage: (...args: unknown[]) => mockAutoAdvanceAssessmentStage(...args),
}));

describe("assessments routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue({
      userId: "user-1",
      role: "recruiter",
      organisationId: "org-1",
    });
    mockHasAnyEnterpriseRole.mockResolvedValue(true);
    mockGetOrgSettingsPermissions.mockResolvedValue({});
    mockHasSettingsCapability.mockReturnValue(true);
    mockCreateNotification.mockResolvedValue(undefined);
    mockCreateCodingTestSession.mockResolvedValue({ launchUrl: "https://coding.test/session/1" });
    mockCreateAssessmentShareToken.mockReturnValue("share-token-123");
    mockGetAssessmentShareUrl.mockReturnValue("https://example.com/assessments/share-token-123");
    mockSendAssessmentShareMessages.mockResolvedValue({ emailSent: true, whatsappSent: false });
    mockAutoAdvanceAssessmentStage.mockResolvedValue(true);
  });

  it("GET /api/assessments filters by jobId for recruiters", async () => {
    const assessmentsBuilder = createMockQueryBuilder({
      data: [{ id: "asmt-1", application_id: "app-1", status: "pending" }],
    });
    const supabase = createMockSupabase({
      applications: createMockQueryBuilder({
        data: [{ id: "app-1", jobs: { organisation_id: "org-1" } }],
      }),
      assessments: assessmentsBuilder,
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/assessments/route");
    const res = await GET(new NextRequest("http://localhost/api/assessments?jobId=job-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assessments).toHaveLength(1);
  });

  it("GET /api/assessments returns raw score, max_score and scored_at (no aliases)", async () => {
    const assessmentsBuilder = createMockQueryBuilder({
      data: [
        {
          id: "asmt-1",
          application_id: "app-1",
          status: "scored",
          score: 8,
          max_score: 10,
          scored_at: "2026-07-01T00:00:00Z",
        },
      ],
    });
    const supabase = createMockSupabase({ assessments: assessmentsBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/assessments/route");
    const res = await GET(new NextRequest("http://localhost/api/assessments"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assessments[0].score).toBe(8);
    expect(body.assessments[0].max_score).toBe(10);

    // The recruiter/candidate pages read `score`/`max_score`; the old select
    // aliased score→score_pct and omitted max_score so badges never rendered.
    const selectMock = assessmentsBuilder.select as ReturnType<typeof vi.fn>;
    const selectArg = selectMock.mock.calls[0][0] as string;
    expect(selectArg).toContain("max_score");
    expect(selectArg).toContain("scored_at");
    expect(selectArg).not.toContain("score_pct");
    expect(selectArg).not.toContain("graded_at");
  });

  it("GET /api/assessments returns 400 when stageId does not belong to jobId", async () => {
    const supabase = createMockSupabase({
      pipeline_stages: createMockQueryBuilder({
        data: { job_id: "other-job" },
      }),
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/assessments/route");
    const res = await GET(
      new NextRequest("http://localhost/api/assessments?jobId=job-1&stageId=stage-1"),
    );
    expect(res.status).toBe(400);
  });

  it("GET /api/assessments returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/assessments/route");
    const res = await GET(new NextRequest("http://localhost/api/assessments"));
    expect(res.status).toBe(401);
  });

  it("POST /api/assessments returns 403 when workflow role is missing", async () => {
    mockHasAnyEnterpriseRole.mockResolvedValue(false);
    mockCreateSupabaseServerClient.mockResolvedValue(createMockSupabase());

    const { POST } = await import("@/app/api/assessments/route");
    const req = new NextRequest("http://localhost/api/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationId: "11111111-1111-4111-8111-111111111111",
        type: "written",
        title: "Round 1",
        deadlineAt: "2099-01-01T00:00:00.000Z",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("POST /api/assessments creates assessment and returns share metadata", async () => {
    const supabase = createMockSupabase({
      applications: createMockQueryBuilder({
        data: {
          id: "11111111-1111-4111-8111-111111111111",
          candidate_id: "cand-1",
          job_id: "job-1",
          jobs: { organisation_id: "org-1" },
        },
      }),
      assessments: createMockQueryBuilder({
        data: { id: "asmt-1", reviewer_id: null, title: "Round 1" },
      }),
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/assessments/route");
    const req = new NextRequest("http://localhost/api/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationId: "11111111-1111-4111-8111-111111111111",
        type: "written",
        title: "Round 1",
        instructions: "Please submit your solution",
        deadlineAt: "2099-01-01T00:00:00.000Z",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.share.token).toBe("share-token-123");
  });

  it("POST /api/assessments/[id]/submit returns 409 for expired deadline", async () => {
    const supabase = createMockSupabase({
      assessments: createMockQueryBuilder({
        data: {
          id: "asmt-1",
          status: "pending",
          deadline_at: "2000-01-01T00:00:00.000Z",
          application_id: "app-1",
        },
      }),
      candidates: createMockQueryBuilder({ data: { id: "cand-1" } }),
      applications: createMockQueryBuilder({ data: { id: "app-1", candidate_id: "cand-1" } }),
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/assessments/[id]/submit/route");
    const req = new NextRequest("http://localhost/api/assessments/asmt-1/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionText: "my answer" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "asmt-1" }) });
    expect(res.status).toBe(409);
  });

  it("POST /api/assessments/[id]/score returns 409 when assessment is not submitted", async () => {
    const supabase = createMockSupabase({
      assessments: createMockQueryBuilder({
        data: {
          id: "asmt-1",
          status: "pending",
          application_id: "app-1",
          stage_id: "stage-1",
          pass_threshold_pct: 70,
          auto_advance: true,
          applications: { jobs: { organisation_id: "org-1" } },
        },
      }),
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/assessments/[id]/score/route");
    const req = new NextRequest("http://localhost/api/assessments/asmt-1/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score: 8, maxScore: 10 }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "asmt-1" }) });
    expect(res.status).toBe(409);
  });

  it("POST /api/assessments/[id]/score returns 403 for cross-org assessment", async () => {
    const supabase = createMockSupabase({
      assessments: createMockQueryBuilder({
        data: {
          id: "asmt-1",
          status: "submitted",
          application_id: "app-1",
          stage_id: "stage-1",
          pass_threshold_pct: 70,
          auto_advance: false,
          applications: { jobs: { organisation_id: "org-2" } },
        },
      }),
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/assessments/[id]/score/route");
    const req = new NextRequest("http://localhost/api/assessments/asmt-1/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score: 8, maxScore: 10 }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "asmt-1" }) });
    expect(res.status).toBe(403);
  });

  it("POST /api/assessments/[id]/score auto-advances when threshold is met", async () => {
    const assessmentsBuilder = createMockQueryBuilder({
      data: {
        id: "asmt-1",
        status: "submitted",
        application_id: "app-1",
        stage_id: "stage-1",
        pass_threshold_pct: 70,
        auto_advance: true,
        applications: { jobs: { organisation_id: "org-1" } },
      },
    });
    assessmentsBuilder.update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "asmt-1", status: "scored", score: 8, max_score: 10 },
              error: null,
            }),
          }),
        }),
      }),
    });
    const supabase = createMockSupabase({ assessments: assessmentsBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/assessments/[id]/score/route");
    const req = new NextRequest("http://localhost/api/assessments/asmt-1/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score: 8, maxScore: 10 }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "asmt-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scorePct).toBe(80);
    expect(body.autoAdvanced).toBe(true);
    expect(mockAutoAdvanceAssessmentStage).toHaveBeenCalledWith("app-1", "stage-1");
  });
});

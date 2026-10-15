import { beforeEach, describe, expect, it, vi } from "vitest";
import { agencyCtx, recruiterCtx, createMockQueryBuilder } from "../helpers";

const mockGetAuthContext = vi.fn();
const mockCreateSupabaseServerClient = vi.fn();
const mockCreateSupabaseAdmin = vi.fn();

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
  handleApiError: (_err: unknown, msg: string) =>
    new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("@/lib/config/env", () => ({
  env: {
    ffConfidenceBand: false,
    ffVerdictCvEvidence: false,
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockCreateSupabaseAdmin(),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("GET /api/my-pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupRouteData() {
    const linksBuilder = createMockQueryBuilder({
      data: [{ client_organisation_id: "client-1" }],
    });
    const jobsBuilder = createMockQueryBuilder({
      data: [
        {
          id: "job-1",
          title: "Backend Engineer",
          status: "open",
          hiring_manager_id: "hm-1",
          organisation_id: "client-1",
        },
      ],
    });
    const pipelineBuilder = createMockQueryBuilder({
      data: [
        {
          id: "pc-1",
          job_id: "job-1",
          candidate_id: "cand-1",
          stage_id: null,
          status: "shortlisted",
          agency_stage: "new_applied",
          interview_scheduled_at: null,
          interview_outcome: null,
          recruiter_rating: null,
          created_at: "2026-03-07T00:00:00.000Z",
          candidates: {
            id: "cand-1",
            name: "Active Candidate",
            email: "active@example.com",
            skills: ["Node.js"],
            location: "Bengaluru",
            processing_status: "done",
          },
        },
        {
          id: "pc-2",
          job_id: "job-1",
          candidate_id: "cand-2",
          stage_id: null,
          status: "rejected",
          agency_stage: "new_applied",
          interview_scheduled_at: null,
          interview_outcome: null,
          recruiter_rating: null,
          created_at: "2026-03-06T00:00:00.000Z",
          candidates: {
            id: "cand-2",
            name: "Dropped Candidate",
            email: "dropped@example.com",
            skills: ["React"],
            location: "Mumbai",
            processing_status: "done",
          },
        },
      ],
    });
    const approvalsBuilder = createMockQueryBuilder({ data: [] });
    const scoresBuilder = createMockQueryBuilder({ data: [] });
    const orgsBuilder = createMockQueryBuilder({
      data: [{ id: "client-1", name: "Client One" }],
    });
    const stagesBuilder = createMockQueryBuilder({ data: [] });
    const applicationsBuilder = createMockQueryBuilder({ data: [] });
    const vouchesBuilder = createMockQueryBuilder({ data: [] });
    const referrersBuilder = createMockQueryBuilder({ data: [] });

    mockCreateSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "agency_clients") return linksBuilder;
        if (table === "jobs") return jobsBuilder;
        if (table === "pipeline_candidates") return pipelineBuilder;
        if (table === "shortlist_approvals") return approvalsBuilder;
        if (table === "pipeline_stages") return stagesBuilder;
        if (table === "fit_scores") return scoresBuilder;
        if (table === "organisations") return orgsBuilder;
        if (table === "applications") return applicationsBuilder;
        if (table === "vouches") return vouchesBuilder;
        if (table === "referrers") return referrersBuilder;
        if (table === "pipeline_stage_transitions") return createMockQueryBuilder({ data: [] });
        throw new Error(`Unexpected admin table: ${table}`);
      }),
    });
  }

  it("uses stage transition entered_at for sla_days_in_stage", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);

    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const justNow = new Date().toISOString();

    const jobsBuilder = createMockQueryBuilder({
      data: [
        {
          id: "job-1",
          title: "Backend Engineer",
          status: "open",
          hiring_manager_id: "hm-1",
          organisation_id: "org-1",
        },
      ],
    });
    const pipelineBuilder = createMockQueryBuilder({
      data: [
        {
          id: "pc-1",
          job_id: "job-1",
          candidate_id: "cand-1",
          stage_id: "stage-2",
          status: "in_progress",
          agency_stage: "new_applied",
          interview_scheduled_at: null,
          interview_outcome: null,
          recruiter_rating: null,
          created_at: "2026-01-01T00:00:00.000Z",
          candidates: {
            id: "cand-1",
            name: "Active Candidate",
            email: "active@example.com",
            skills: ["Node.js"],
            location: "Bengaluru",
            processing_status: "done",
          },
        },
      ],
    });
    const stagesBuilder = createMockQueryBuilder({
      data: [
        {
          id: "stage-2",
          job_id: "job-1",
          stage_name: "Interview",
          stage_order: 1,
          sla_days: 30,
          stage_type: "interview",
        },
      ],
    });
    const applicationsBuilder = createMockQueryBuilder({
      data: [
        {
          id: "app-1",
          job_id: "job-1",
          candidate_id: "cand-1",
          source: "direct",
          direct_referrer_id: null,
          parent_referrer_id: null,
          referral_link_id: null,
          applied_at: "2026-01-05T00:00:00.000Z",
          updated_at: justNow,
          stage_type: null,
          billing_ctc_required: false,
          current_ctc_lpa: null,
          expected_ctc_lpa: null,
          notice_period_days: null,
          offers_in_hand: null,
          available_from: null,
          relocation_willingness: null,
        },
      ],
    });
    const transitionsBuilder = createMockQueryBuilder({
      data: [
        {
          pipeline_candidate_id: "pc-1",
          to_stage: "Interview",
          entered_at: tenDaysAgo,
        },
      ],
    });

    mockCreateSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "jobs") return jobsBuilder;
        if (table === "pipeline_candidates") return pipelineBuilder;
        if (table === "shortlist_approvals") return createMockQueryBuilder({ data: [] });
        if (table === "pipeline_stages") return stagesBuilder;
        if (table === "fit_scores") return createMockQueryBuilder({ data: [] });
        if (table === "organisations")
          return createMockQueryBuilder({ data: [{ id: "org-1", name: "Org One" }] });
        if (table === "applications") return applicationsBuilder;
        if (table === "vouches") return createMockQueryBuilder({ data: [] });
        if (table === "referrers") return createMockQueryBuilder({ data: [] });
        if (table === "pipeline_stage_transitions") return transitionsBuilder;
        throw new Error(`Unexpected admin table: ${table}`);
      }),
    });

    const { GET } = await import("@/app/api/my-pipeline/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pipeline[0].sla_days_in_stage).toBeGreaterThanOrEqual(9);
    expect(body.pipeline[0].sla_days_in_stage).toBeLessThan(12);
  });

  it("returns stageCatalog rows with job scoping", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);

    const jobsBuilder = createMockQueryBuilder({
      data: [
        {
          id: "job-1",
          title: "Backend Engineer",
          status: "open",
          hiring_manager_id: "hm-1",
          organisation_id: "org-1",
        },
      ],
    });
    const pipelineBuilder = createMockQueryBuilder({
      data: [
        {
          id: "pc-1",
          job_id: "job-1",
          candidate_id: "cand-1",
          stage_id: "stage-2",
          status: "in_progress",
          agency_stage: "new_applied",
          interview_scheduled_at: null,
          interview_outcome: null,
          recruiter_rating: null,
          created_at: "2026-03-07T00:00:00.000Z",
          candidates: {
            id: "cand-1",
            name: "Active Candidate",
            email: "active@example.com",
            skills: ["Node.js"],
            location: "Bengaluru",
            processing_status: "done",
          },
        },
      ],
    });
    const stagesBuilder = createMockQueryBuilder({
      data: [
        { id: "stage-1", job_id: "job-1", stage_name: "Applied", stage_order: 0 },
        { id: "stage-2", job_id: "job-1", stage_name: "Interview", stage_order: 1 },
      ],
    });

    const fitScoresBuilder = createMockQueryBuilder({ data: [] });
    mockCreateSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "jobs") return jobsBuilder;
        if (table === "pipeline_candidates") return pipelineBuilder;
        if (table === "shortlist_approvals") return createMockQueryBuilder({ data: [] });
        if (table === "pipeline_stages") return stagesBuilder;
        if (table === "fit_scores") return fitScoresBuilder;
        if (table === "organisations")
          return createMockQueryBuilder({ data: [{ id: "org-1", name: "Org One" }] });
        if (table === "applications") return createMockQueryBuilder({ data: [] });
        if (table === "vouches") return createMockQueryBuilder({ data: [] });
        if (table === "referrers") return createMockQueryBuilder({ data: [] });
        if (table === "pipeline_stage_transitions") return createMockQueryBuilder({ data: [] });
        throw new Error(`Unexpected admin table: ${table}`);
      }),
    });

    const { GET } = await import("@/app/api/my-pipeline/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stageCatalog).toEqual([
      { id: "stage-1", job_id: "job-1", stage_name: "Applied", stage_order: 0 },
      { id: "stage-2", job_id: "job-1", stage_name: "Interview", stage_order: 1 },
    ]);
    expect(body.pipeline[0].stageOrder).toBe(1);
    expect(body.pipeline[0].stageName).toBe("Interview");
    expect(fitScoresBuilder.is).toHaveBeenCalledWith("superseded_at", null);
  });

  it("hides rejected pipeline entries for agency users", async () => {
    mockGetAuthContext.mockResolvedValue(agencyCtx);
    setupRouteData();

    const { GET } = await import("@/app/api/my-pipeline/route");
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pipeline).toHaveLength(2);
    expect(body.pipeline[0].id).toBe("pc-1");
  });

  it("still returns rejected pipeline entries for recruiter views", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    setupRouteData();

    const { GET } = await import("@/app/api/my-pipeline/route");
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pipeline).toHaveLength(2);
    expect(body.pipeline.map((pc: { id: string }) => pc.id)).toEqual(["pc-1", "pc-2"]);
  });
});

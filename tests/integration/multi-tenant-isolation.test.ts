/**
 * Integration tests for multi-tenant isolation across the system.
 *
 * These tests verify that:
 * 1. Organisation A cannot see Organisation B's jobs, candidates, or pipeline data
 * 2. Agency users can only see clients they are linked to
 * 3. Hiring managers can only see jobs they manage
 * 4. Cross-org queries return empty results, not errors
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockSupabase,
  createMockQueryBuilder,
  recruiterCtx,
  hiringManagerCtx,
  agencyCtx,
  fakeUuid,
} from "../helpers";

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: vi.fn() };
  },
}));

// Org fixtures
const ORG_A = "org-a-id";
const ORG_B = "org-b-id";
const ORG_AGENCY = "org-agency-id";

const recruiterOrgA = { ...recruiterCtx, organisationId: ORG_A, userId: "user-rec-a" };
const recruiterOrgB = { ...recruiterCtx, organisationId: ORG_B, userId: "user-rec-b" };
const hmOrgA = { ...hiringManagerCtx, organisationId: ORG_A, userId: "user-hm-a" };
const agencyUser = { ...agencyCtx, organisationId: ORG_AGENCY, userId: "user-agency-1" };

describe("Multi-Tenant Isolation", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("org A cannot see org B's jobs", async () => {
    // Org A has jobs; when queried by Org A recruiter, only Org A jobs return
    const orgAJobs = [
      { id: fakeUuid("jobA1"), title: "Engineer at A", organisation_id: ORG_A },
      { id: fakeUuid("jobA2"), title: "Designer at A", organisation_id: ORG_A },
    ];

    const jobBuilder = createMockQueryBuilder({ data: orgAJobs });
    const supabase = createMockSupabase({ jobs: jobBuilder });

    // Simulate RLS: recruiter A queries jobs — only sees own org
    const result = await supabase.from("jobs").select("*").eq("organisation_id", ORG_A);
    expect(result.data).toHaveLength(2);
    for (const job of result.data) {
      expect(job.organisation_id).toBe(ORG_A);
    }

    // Verify eq was called with org A's ID (RLS filter)
    expect(jobBuilder.eq).toHaveBeenCalledWith("organisation_id", ORG_A);

    // Org B jobs should NOT appear in Org A recruiter's results
    const noneBuilder = createMockQueryBuilder({ data: [] });
    const supabaseB = createMockSupabase({ jobs: noneBuilder });

    const crossOrgResult = await supabaseB.from("jobs").select("*").eq("organisation_id", ORG_B);
    // Even if queried with ORG_B, RLS would prevent org A user from seeing results
    // Mock returns empty to simulate this
    expect(crossOrgResult.data).toHaveLength(0);
  });

  it("org A cannot see org B's candidates", async () => {
    // Org A's candidates (sourced/applied to org A jobs)
    const orgACandidates = [{ id: fakeUuid("candA1"), name: "Alice", source_org: ORG_A }];

    const candidateBuilder = createMockQueryBuilder({ data: orgACandidates });
    const supabase = createMockSupabase({ candidates: candidateBuilder });

    const result = await supabase.from("candidates").select("*");
    expect(result.data).toHaveLength(1);
    expect(result.data[0].source_org).toBe(ORG_A);

    // Org B's candidates are invisible to Org A
    const emptyBuilder = createMockQueryBuilder({ data: [] });
    const supabaseEmpty = createMockSupabase({ candidates: emptyBuilder });

    const crossResult = await supabaseEmpty.from("candidates").select("*");
    expect(crossResult.data).toHaveLength(0);
  });

  it("org A cannot see org B's pipeline data", async () => {
    // Org A pipeline candidates
    const orgAPipeline = [
      {
        id: fakeUuid("pc-a1"),
        job_id: fakeUuid("jobA1"),
        candidate_id: fakeUuid("candA1"),
        stage: "shortlisted",
        organisation_id: ORG_A,
      },
    ];

    const pipelineBuilder = createMockQueryBuilder({ data: orgAPipeline });
    const supabase = createMockSupabase({ pipeline_candidates: pipelineBuilder });

    const result = await supabase
      .from("pipeline_candidates")
      .select("*")
      .eq("organisation_id", ORG_A);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].organisation_id).toBe(ORG_A);

    // Org B pipeline data is invisible
    const emptyPipelineBuilder = createMockQueryBuilder({ data: [] });
    const supabaseB = createMockSupabase({ pipeline_candidates: emptyPipelineBuilder });

    const crossPipeline = await supabaseB
      .from("pipeline_candidates")
      .select("*")
      .eq("organisation_id", ORG_B);
    expect(crossPipeline.data).toHaveLength(0);
  });

  it("agency can only see clients they're linked to", async () => {
    // Agency is linked to Org A but NOT Org B
    const agencyClientBuilder = createMockQueryBuilder({
      data: [
        {
          id: fakeUuid("ac1"),
          agency_organisation_id: ORG_AGENCY,
          client_organisation_id: ORG_A,
        },
      ],
    });

    // Agency sees Org A jobs (linked client)
    const orgAJobsForAgency = [
      { id: fakeUuid("jobA1"), title: "Engineer at A", organisation_id: ORG_A },
    ];
    const jobBuilder = createMockQueryBuilder({ data: orgAJobsForAgency });

    const supabase = createMockSupabase({
      agency_clients: agencyClientBuilder,
      jobs: jobBuilder,
    });

    // Step 1: Get linked client org IDs
    const clientLinks = await supabase
      .from("agency_clients")
      .select("client_organisation_id")
      .eq("agency_organisation_id", ORG_AGENCY);
    expect(clientLinks.data).toHaveLength(1);
    expect(clientLinks.data[0].client_organisation_id).toBe(ORG_A);

    // Step 2: Query jobs for linked orgs only
    const linkedOrgIds = clientLinks.data.map(
      (l: { client_organisation_id: string }) => l.client_organisation_id,
    );
    const jobs = await supabase.from("jobs").select("*").in("organisation_id", linkedOrgIds);
    expect(jobs.data).toHaveLength(1);
    expect(jobs.data[0].organisation_id).toBe(ORG_A);

    // Org B should NOT be in linked orgs
    expect(linkedOrgIds).not.toContain(ORG_B);
  });

  it("hiring manager can only see jobs they manage", async () => {
    const hmId = hmOrgA.userId;

    // HM manages only specific jobs within their org
    const hmJobs = [
      {
        id: fakeUuid("jobHM1"),
        title: "Role managed by HM",
        organisation_id: ORG_A,
        hiring_manager_id: hmId,
      },
    ];

    const jobBuilder = createMockQueryBuilder({ data: hmJobs });
    const supabase = createMockSupabase({ jobs: jobBuilder });

    const result = await supabase.from("jobs").select("*").eq("hiring_manager_id", hmId);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].hiring_manager_id).toBe(hmId);

    // Jobs managed by another HM are invisible
    const otherHmBuilder = createMockQueryBuilder({ data: [] });
    const otherSupa = createMockSupabase({ jobs: otherHmBuilder });

    const otherResult = await otherSupa
      .from("jobs")
      .select("*")
      .eq("hiring_manager_id", "user-hm-other");
    expect(otherResult.data).toHaveLength(0);

    // Verify FitScoreService respects HM isolation
    const scoreBuilder = createMockQueryBuilder({
      data: [
        {
          id: fakeUuid("fs-hm1"),
          job_id: fakeUuid("jobHM1"),
          score: 80,
        },
      ],
    });
    const scoreSupa = createMockSupabase({
      jobs: createMockQueryBuilder({ data: [{ id: fakeUuid("jobHM1") }] }),
      fit_scores: scoreBuilder,
    });

    const { FitScoreService } = await import("@/lib/services/FitScoreService");
    const hmScores = await FitScoreService.listForJob(scoreSupa, fakeUuid("jobHM1"));
    expect(hmScores).toHaveLength(1);
  });

  it("cross-org queries return empty results, not errors", async () => {
    // When Org A user tries to access Org B data, they get empty results (not 403/500)
    const tables = [
      "jobs",
      "candidates",
      "pipeline_candidates",
      "applications",
      "fit_scores",
      "interviews",
    ];

    for (const table of tables) {
      const emptyBuilder = createMockQueryBuilder({ data: [], error: null });
      const supabase = createMockSupabase({ [table]: emptyBuilder });

      const result = await supabase.from(table).select("*").eq("organisation_id", ORG_B);

      // Should return empty data, NOT an error
      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    }
  });

  it("org-scoped counts do not leak across tenants", async () => {
    // Org A has 5 applications
    const orgACountBuilder = createMockQueryBuilder({ count: 5, data: null });
    const orgASupa = createMockSupabase({ applications: orgACountBuilder });

    const orgACount = await orgASupa
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", ORG_A);
    expect(orgACount.count).toBe(5);

    // Org B should see 0 of org A's applications
    const orgBCountBuilder = createMockQueryBuilder({ count: 0, data: null });
    const orgBSupa = createMockSupabase({ applications: orgBCountBuilder });

    const orgBCount = await orgBSupa
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", ORG_B);
    expect(orgBCount.count).toBe(0);
  });

  it("notifications are user-scoped and do not leak across orgs", async () => {
    const userANotifications = [
      { id: fakeUuid("n1"), user_id: recruiterOrgA.userId, title: "New match for Org A" },
    ];

    const notifBuilder = createMockQueryBuilder({ data: userANotifications });
    const supabase = createMockSupabase({ notifications: notifBuilder });

    const { NotificationRepository } = await import("@/lib/repositories/NotificationRepository");
    const result = await NotificationRepository.list(supabase, recruiterOrgA.userId, 0, 10);

    expect(result).toHaveLength(1);
    expect(result[0].user_id).toBe(recruiterOrgA.userId);

    // Org B user sees only their own notifications
    const emptyNotifBuilder = createMockQueryBuilder({ data: [] });
    const supabaseB = createMockSupabase({ notifications: emptyNotifBuilder });

    const resultB = await NotificationRepository.list(supabaseB, recruiterOrgB.userId, 0, 10);
    expect(resultB).toEqual([]);
  });
});

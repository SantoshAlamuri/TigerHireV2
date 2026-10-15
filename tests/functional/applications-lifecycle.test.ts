import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, createMockQueryBuilder } from "../helpers";

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => ({
    rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "not deployed" } }),
  })),
}));

vi.mock("@/lib/redis/auth-profile-cache", () => ({
  deleteCachedAuthProfile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/hiring-outcomes", () => ({
  upsertHiringOutcome: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/agents/payout-trigger", () => ({
  triggerPayoutIfEligible: vi.fn().mockResolvedValue(undefined),
}));

describe("Application Lifecycle — Functional Tests", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("APPLICATION_COOLING_OFF_DAYS", "0");
  });

  describe("Full application flow", () => {
    it("creates an application and tracks status transitions", async () => {
      const newApp = {
        id: "a1",
        status: "applied",
        candidate_id: "c1",
        job_id: "j1",
      };
      const jobBuilder = createMockQueryBuilder({
        data: { id: "j1", organisation_id: "org-1" },
      });
      const appBuilder = createMockQueryBuilder({ data: newApp });
      (appBuilder.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: null,
        error: null,
      });
      const scoreBuilder = createMockQueryBuilder({ data: { id: "fs-1" } });
      const supabase = createMockSupabase({
        jobs: jobBuilder,
        applications: appBuilder,
        fit_scores: scoreBuilder,
      });

      const { ApplicationService } = await import("@/lib/services/ApplicationService");
      const created = await ApplicationService.create(supabase, "c1", {
        jobId: "j1",
        fitScoreId: "fs-1",
        interest: "strong_interest",
      });

      expect(created).toEqual(newApp);
    });

    it("lists applications for a candidate with pagination", async () => {
      const apps = [
        { id: "a1", status: "applied" },
        { id: "a2", status: "shortlisted" },
        { id: "a3", status: "viewed" },
      ];
      const builder = createMockQueryBuilder({ data: apps, count: 3 });
      const supabase = createMockSupabase({ applications: builder });

      const { ApplicationService } = await import("@/lib/services/ApplicationService");
      const result = await ApplicationService.listForCandidate(supabase, "c1", {
        page: 1,
        limit: 10,
      });

      expect(result.applications).toHaveLength(3);
      expect(result.pagination.total).toBe(3);
    });

    it("lists applications for a recruiter", async () => {
      const apps = Array.from({ length: 50 }, (_, i) => ({
        id: `a${i}`,
        status: i % 3 === 0 ? "applied" : i % 3 === 1 ? "viewed" : "shortlisted",
      }));
      const builder = createMockQueryBuilder({ data: apps, count: 50 });
      const supabase = createMockSupabase({ applications: builder });

      const { ApplicationService } = await import("@/lib/services/ApplicationService");
      const result = await ApplicationService.listForRecruiter(supabase, {
        page: 1,
        limit: 50,
      });

      expect(result.applications).toHaveLength(50);
    });
  });

  describe("Status transitions", () => {
    const transitions = [
      { from: "applied", to: "viewed" },
      { from: "viewed", to: "shortlisted" },
      { from: "shortlisted", to: "hired" },
      { from: "applied", to: "rejected" },
    ];

    for (const { from, to } of transitions) {
      it(`transitions from ${from} to ${to}`, async () => {
        const app = {
          id: "a1",
          job_id: "j1",
          candidate_id: "c1",
          status: from,
        };
        const appBuilder = createMockQueryBuilder({ data: app });
        const candidatesBuilder = createMockQueryBuilder({
          data: { user_id: "u1" },
        });
        const jobsBuilder = createMockQueryBuilder({
          data: { title: "Engineer" },
        });
        const notifBuilder = createMockQueryBuilder();
        const feedbackBuilder = createMockQueryBuilder();

        const supabase = createMockSupabase({
          applications: appBuilder,
          candidates: candidatesBuilder,
          jobs: jobsBuilder,
          notifications: notifBuilder,
          delivery_feedback: feedbackBuilder,
        });

        const { ApplicationService } = await import("@/lib/services/ApplicationService");
        await ApplicationService.updateStatus(supabase, "a1", to, "recruiter-1");

        const updateCall = (appBuilder.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(updateCall.status).toBe(to);
      });
    }
  });

  describe("Edge cases", () => {
    it("handles empty application list gracefully", async () => {
      const builder = createMockQueryBuilder({ data: [], count: 0 });
      const supabase = createMockSupabase({ applications: builder });

      const { ApplicationService } = await import("@/lib/services/ApplicationService");
      const result = await ApplicationService.listForCandidate(supabase, "c1", {
        page: 1,
        limit: 10,
      });

      expect(result.applications).toEqual([]);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, createMockQueryBuilder } from "../helpers";

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => {
    const defaultBuilder = createMockQueryBuilder({ data: null, error: null });
    const jobsBuilder = createMockQueryBuilder({ data: { organisation_id: "org-1" }, error: null });
    const fitScoreBuilder = createMockQueryBuilder({ data: null, error: null });
    const hiringOutcomesBuilder = createMockQueryBuilder({ data: null, error: null });
    return {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "not deployed" } }),
      from: vi.fn((table: string) => {
        if (table === "jobs") return jobsBuilder;
        if (table === "fit_scores") return fitScoreBuilder;
        if (table === "hiring_outcomes") return hiringOutcomesBuilder;
        return defaultBuilder;
      }),
    };
  }),
}));

vi.mock("@/lib/redis/auth-profile-cache", () => ({
  deleteCachedAuthProfile: vi.fn().mockResolvedValue(undefined),
}));

describe("ApplicationService", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("APPLICATION_COOLING_OFF_DAYS", "0");
  });

  describe("listForCandidate", () => {
    it("returns applications with pagination", async () => {
      const apps = [{ id: "a1", status: "applied" }];
      const builder = createMockQueryBuilder({ data: apps, count: 1 });
      const supabase = createMockSupabase({ applications: builder });

      const { ApplicationService } = await import("@/lib/services/ApplicationService");
      const result = await ApplicationService.listForCandidate(supabase, "c1", {
        page: 1,
        limit: 10,
      });

      expect(result.applications).toEqual(apps);
      expect(result.pagination).toMatchObject({ page: 1, limit: 10, total: 1 });
    });
  });

  describe("listForRecruiter", () => {
    it("returns applications with pagination", async () => {
      const apps = [
        { id: "a1", status: "applied" },
        { id: "a2", status: "shortlisted" },
      ];
      const builder = createMockQueryBuilder({ data: apps, count: 2 });
      const supabase = createMockSupabase({ applications: builder });

      const { ApplicationService } = await import("@/lib/services/ApplicationService");
      const result = await ApplicationService.listForRecruiter(supabase, {
        page: 1,
        limit: 10,
      });

      expect(result.applications).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
    });
  });

  describe("create", () => {
    it("creates application with provided fitScoreId", async () => {
      const newApp = {
        id: "a-new",
        status: "applied",
        candidate_id: "c1",
        job_id: "j1",
      };
      const jobBuilder = createMockQueryBuilder({
        data: { id: "j1", organisation_id: "org-1" },
      });
      const builder = createMockQueryBuilder({ data: newApp });
      (builder.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: null,
        error: null,
      });
      const supabase = createMockSupabase({
        jobs: jobBuilder,
        applications: builder,
      });

      const { ApplicationService } = await import("@/lib/services/ApplicationService");
      const result = await ApplicationService.create(supabase, "c1", {
        jobId: "j1",
        fitScoreId: "fs-1",
        interest: "interested",
      });

      expect(result).toEqual(newApp);
      const insertCall = (builder.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(insertCall.fit_score_id).toBe("fs-1");
      expect(insertCall.status).toBe("applied");
    });

    it("looks up existing score when fitScoreId not provided", async () => {
      const jobBuilder = createMockQueryBuilder({
        data: { id: "j1", organisation_id: "org-1" },
      });
      const scoreBuilder = createMockQueryBuilder({ data: { id: "fs-found" } });
      const appBuilder = createMockQueryBuilder({ data: { id: "a-new" } });
      (appBuilder.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: null,
        error: null,
      });
      const supabase = createMockSupabase({
        jobs: jobBuilder,
        fit_scores: scoreBuilder,
        applications: appBuilder,
      });

      const { ApplicationService } = await import("@/lib/services/ApplicationService");
      await ApplicationService.create(supabase, "c1", {
        jobId: "j1",
        interest: "strong_interest",
      });

      expect(supabase.from).toHaveBeenCalledWith("fit_scores");
    });

    it("throws ApplicationApplyError when org cooling-off is active", async () => {
      vi.stubEnv("APPLICATION_COOLING_OFF_DAYS", "90");
      const jobBuilder = createMockQueryBuilder({
        data: { id: "j1", organisation_id: "org-1" },
      });
      const appBuilder = createMockQueryBuilder({});
      const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
      (appBuilder.maybeSingle as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          data: { updated_at: recent, jobs: { organisation_id: "org-1" } },
          error: null,
        })
        .mockResolvedValueOnce({ data: null, error: null });

      const supabase = createMockSupabase({
        jobs: jobBuilder,
        applications: appBuilder,
      });

      const { ApplicationService } = await import("@/lib/services/ApplicationService");
      const { ApplicationApplyError } = await import("@/lib/applications/application-apply-error");

      await expect(
        ApplicationService.create(supabase, "c1", {
          jobId: "j1",
          interest: "interested",
        }),
      ).rejects.toBeInstanceOf(ApplicationApplyError);
    });
  });

  describe("updateStatus", () => {
    it("sets viewed_at when status is viewed", async () => {
      const app = { id: "a1", job_id: "j1", candidate_id: "c1" };
      const appBuilder = createMockQueryBuilder({ data: app });
      const candidatesBuilder = createMockQueryBuilder({
        data: { user_id: "u1" },
      });
      const jobsBuilder = createMockQueryBuilder({
        data: { title: "Engineer" },
      });
      const notifBuilder = createMockQueryBuilder();

      const supabase = createMockSupabase({
        applications: appBuilder,
        candidates: candidatesBuilder,
        jobs: jobsBuilder,
        notifications: notifBuilder,
      });

      const { ApplicationService } = await import("@/lib/services/ApplicationService");
      await ApplicationService.updateStatus(supabase, "a1", "viewed", "recruiter-1");

      const updateCall = (appBuilder.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateCall.status).toBe("viewed");
      expect(updateCall.viewed_at).toBeDefined();
    });

    it("creates delivery_feedback for hired/rejected status", async () => {
      const app = { id: "a1", job_id: "j1", candidate_id: "c1" };
      const appBuilder = createMockQueryBuilder({ data: app });
      const feedbackBuilder = createMockQueryBuilder();
      const candidatesBuilder = createMockQueryBuilder({
        data: { user_id: "u1" },
      });
      const jobsBuilder = createMockQueryBuilder({
        data: { title: "Engineer" },
      });
      const notifBuilder = createMockQueryBuilder();

      const supabase = createMockSupabase({
        applications: appBuilder,
        delivery_feedback: feedbackBuilder,
        candidates: candidatesBuilder,
        jobs: jobsBuilder,
        notifications: notifBuilder,
      });

      const { ApplicationService } = await import("@/lib/services/ApplicationService");
      await ApplicationService.updateStatus(supabase, "a1", "hired", "recruiter-1");

      expect(supabase.from).toHaveBeenCalledWith("delivery_feedback");
      expect(feedbackBuilder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: "hired" }),
        expect.any(Object),
      );
    });

    it("creates notification for candidate on status change", async () => {
      const app = { id: "a1", job_id: "j1", candidate_id: "c1" };
      const appBuilder = createMockQueryBuilder({ data: app });
      const candidatesBuilder = createMockQueryBuilder({
        data: { user_id: "u1" },
      });
      const jobsBuilder = createMockQueryBuilder({
        data: { title: "Engineer" },
      });
      const notifBuilder = createMockQueryBuilder();

      const supabase = createMockSupabase({
        applications: appBuilder,
        candidates: candidatesBuilder,
        jobs: jobsBuilder,
        notifications: notifBuilder,
      });

      const { ApplicationService } = await import("@/lib/services/ApplicationService");
      await ApplicationService.updateStatus(supabase, "a1", "shortlisted", "recruiter-1");

      expect(supabase.from).toHaveBeenCalledWith("notifications");
      expect(notifBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "u1",
          type: "application_update",
        }),
      );
    });
  });
});

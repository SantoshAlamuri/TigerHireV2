import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, createMockQueryBuilder } from "../helpers";

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const adminHoisted = vi.hoisted(() => {
  const chain = (singleData: unknown) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "limit", "upsert"]) {
      b[m] = vi.fn().mockReturnValue(b);
    }
    b.maybeSingle = vi.fn().mockResolvedValue({ data: singleData, error: null });
    b.single = vi.fn().mockResolvedValue({ data: singleData, error: null });
    b.then = vi.fn((resolve: (v: unknown) => void) => resolve({ data: singleData, error: null }));
    return b;
  };
  const hiringChain: Record<string, unknown> = {};
  hiringChain.upsert = vi.fn().mockResolvedValue({ data: null, error: null });
  return {
    createAdmin: () => ({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "skip" } }),
      from: (t: string) => {
        if (t === "jobs") return chain({ organisation_id: "org-1" });
        if (t === "fit_scores") return chain(null);
        if (t === "hiring_outcomes") return hiringChain;
        return chain(null);
      },
    }),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => adminHoisted.createAdmin()),
}));

vi.mock("@/lib/fitscore/hybrid/jd-base", () => ({
  ensureJdBaseForJob: vi.fn().mockResolvedValue(undefined),
  getJdBaseByJobId: vi.fn().mockResolvedValue({ id: "jd-1" }),
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

describe("Data Integrity — Functional Tests", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("JobService data consistency", () => {
    it("create sets required audit fields", async () => {
      const builder = createMockQueryBuilder({
        data: { id: "j1", title: "Test" },
      });
      const supabase = createMockSupabase({ jobs: builder });
      const { JobService } = await import("@/lib/services/JobService");

      await JobService.create(
        supabase,
        { title: "Test Job", description: "Description" },
        "user-1",
        "org-1",
      );

      const insertCall = (builder.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(insertCall.organisation_id).toBe("org-1");
      expect(insertCall.created_by).toBe("user-1");
      expect(insertCall.shortlist_due_at).toBeDefined();
    });

    it("shortlist_due_at is exactly 72 hours from creation", async () => {
      const now = new Date("2026-06-15T10:00:00Z");
      vi.setSystemTime(now);

      const builder = createMockQueryBuilder({ data: { id: "j1" } });
      const supabase = createMockSupabase({ jobs: builder });
      const { JobService } = await import("@/lib/services/JobService");

      await JobService.create(supabase, { title: "Job", description: "desc" }, "user-1", "org-1");

      const insertCall = (builder.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const dueAt = new Date(insertCall.shortlist_due_at);
      const expectedDue = new Date(now.getTime() + 72 * 60 * 60 * 1000);
      expect(dueAt.getTime()).toBe(expectedDue.getTime());

      vi.useRealTimers();
    });

    it("delete calls correct method with correct ID", async () => {
      const builder = createMockQueryBuilder();
      const supabase = createMockSupabase({ jobs: builder });
      const { JobService } = await import("@/lib/services/JobService");

      await JobService.remove(supabase, "job-to-delete");

      expect(builder.delete).toHaveBeenCalled();
      expect(builder.eq).toHaveBeenCalledWith("id", "job-to-delete");
    });

    it("update persists changes correctly", async () => {
      const updated = { id: "j1", title: "Updated Title", status: "closed" };
      const builder = createMockQueryBuilder({ data: updated });
      const supabase = createMockSupabase({ jobs: builder });
      const { JobService } = await import("@/lib/services/JobService");

      const result = await JobService.update(supabase, "j1", {
        title: "Updated Title",
        status: "closed",
      });

      expect(result).toEqual(updated);
      expect(builder.update).toHaveBeenCalled();
      expect(builder.eq).toHaveBeenCalledWith("id", "j1");
    });
  });

  describe("ApplicationService data consistency", () => {
    it("updateStatus sets viewed_at timestamp for viewed status", async () => {
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
      expect(updateCall.viewed_at).toBeDefined();
    });

    it("updateStatus creates delivery_feedback for hired status", async () => {
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

    it("updateStatus sends notification on status change", async () => {
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

  describe("Pagination correctness", () => {
    it("calculates totalPages correctly for exact division", async () => {
      const builder = createMockQueryBuilder({ data: [], count: 100 });
      const supabase = createMockSupabase({ jobs: builder });
      const { JobService } = await import("@/lib/services/JobService");

      const result = await JobService.list(supabase, { page: 1, limit: 10 });
      expect(result.pagination.totalPages).toBe(10);
    });

    it("calculates totalPages correctly for non-exact division", async () => {
      const builder = createMockQueryBuilder({ data: [], count: 25 });
      const supabase = createMockSupabase({ jobs: builder });
      const { JobService } = await import("@/lib/services/JobService");

      const result = await JobService.list(supabase, { page: 1, limit: 10 });
      expect(result.pagination.totalPages).toBe(3);
    });

    it("returns empty results for page beyond data", async () => {
      const builder = createMockQueryBuilder({ data: [], count: 5 });
      const supabase = createMockSupabase({ jobs: builder });
      const { JobService } = await import("@/lib/services/JobService");

      const result = await JobService.list(supabase, { page: 100, limit: 10 });
      expect(result.jobs).toEqual([]);
    });
  });
});

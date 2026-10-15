import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, createMockQueryBuilder } from "../helpers";

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => ({})),
}));

vi.mock("@/lib/fitscore/hybrid/jd-base", () => ({
  ensureJdBaseForJob: vi.fn().mockResolvedValue(undefined),
  getJdBaseByJobId: vi.fn().mockResolvedValue({ id: "jdb-1", jobId: "j-new" }),
}));

vi.mock("@/lib/feature-flags", () => ({
  isEnabled: vi.fn().mockResolvedValue(true),
}));

const inngestSend = vi.fn().mockResolvedValue(undefined);
vi.mock("@/inngest/client", () => ({
  inngest: { send: (...args: unknown[]) => inngestSend(...args) },
}));

describe("JobService", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("list", () => {
    it("returns jobs with pagination metadata", async () => {
      const jobs = [
        { id: "j1", title: "Engineer", created_at: "2026-01-01", matched_count: 0 },
        { id: "j2", title: "Designer", created_at: "2026-01-02", matched_count: 0 },
      ];
      const builder = createMockQueryBuilder({ data: jobs, count: 10 });
      const supabase = createMockSupabase({ jobs: builder });

      const { JobService } = await import("@/lib/services/JobService");
      const result = await JobService.list(supabase, {
        page: 1,
        limit: 10,
      });

      expect(result.jobs).toEqual(jobs.map((j) => ({ ...j, matched_count: 0 })));
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 10,
        totalPages: 1,
        nextCursor: undefined,
      });
    });

    it("passes organisationId filter to repository", async () => {
      const builder = createMockQueryBuilder({ data: [], count: 0 });
      const supabase = createMockSupabase({ jobs: builder });

      const { JobService } = await import("@/lib/services/JobService");
      await JobService.list(supabase, {
        page: 1,
        limit: 10,
        organisationId: "org-1",
      });

      expect(builder.eq).toHaveBeenCalledWith("organisation_id", "org-1");
    });

    it("calculates totalPages correctly", async () => {
      const builder = createMockQueryBuilder({ data: [], count: 25 });
      const supabase = createMockSupabase({ jobs: builder });

      const { JobService } = await import("@/lib/services/JobService");
      const result = await JobService.list(supabase, {
        page: 1,
        limit: 10,
      });

      expect(result.pagination.totalPages).toBe(3);
    });
  });

  describe("create", () => {
    it("sets shortlist_due_at to 72 hours from now", async () => {
      const created = { id: "j-new", title: "PM" };
      const builder = createMockQueryBuilder({ data: created });
      const supabase = createMockSupabase({ jobs: builder });

      const now = new Date("2026-03-01T12:00:00Z");
      vi.setSystemTime(now);

      const { JobService } = await import("@/lib/services/JobService");
      await JobService.create(supabase, { title: "PM", description: "desc" }, "user-1", "org-1");

      const insertCall = (builder.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const dueAt = new Date(insertCall.shortlist_due_at);
      expect(dueAt.getTime() - now.getTime()).toBe(72 * 60 * 60 * 1000);
      expect(insertCall.organisation_id).toBe("org-1");
      expect(insertCall.created_by).toBe("user-1");

      vi.useRealTimers();
    });

    it("hands JD Base generation to Inngest and returns without generating inline when a queue is configured", async () => {
      // Publish used to block on two Claude calls (~22s measured on prod). With
      // INNGEST_EVENT_KEY set the request must enqueue and return immediately.
      process.env.INNGEST_EVENT_KEY = "test-key";
      inngestSend.mockClear();
      const builder = createMockQueryBuilder({ data: { id: "j-async", title: "PM" } });
      const supabase = createMockSupabase({ jobs: builder });
      const jdBase = await import("@/lib/fitscore/hybrid/jd-base");
      (jdBase.ensureJdBaseForJob as ReturnType<typeof vi.fn>).mockClear();

      const { JobService } = await import("@/lib/services/JobService");
      const job = await JobService.create(supabase, { title: "PM", description: "d" }, "u", "org");

      expect((job as { id: string }).id).toBe("j-async");
      expect(inngestSend).toHaveBeenCalledWith({
        name: "jd-base/generate",
        data: { jobId: "j-async" },
      });
      expect(jdBase.ensureJdBaseForJob).not.toHaveBeenCalled();
      delete process.env.INNGEST_EVENT_KEY;
    });

    it("falls back to inline JD Base generation when no queue is configured", async () => {
      delete process.env.INNGEST_EVENT_KEY;
      inngestSend.mockClear();
      const builder = createMockQueryBuilder({ data: { id: "j-sync", title: "PM" } });
      const supabase = createMockSupabase({ jobs: builder });
      const jdBase = await import("@/lib/fitscore/hybrid/jd-base");
      (jdBase.ensureJdBaseForJob as ReturnType<typeof vi.fn>).mockClear();

      const { JobService } = await import("@/lib/services/JobService");
      await JobService.create(supabase, { title: "PM", description: "d" }, "u", "org");

      expect(jdBase.ensureJdBaseForJob).toHaveBeenCalledTimes(1);
      expect(inngestSend).not.toHaveBeenCalled();
    });
  });

  describe("getById", () => {
    it("returns job data", async () => {
      const job = { id: "j1", title: "Engineer" };
      const builder = createMockQueryBuilder({ data: job });
      const supabase = createMockSupabase({ jobs: builder });

      const { JobService } = await import("@/lib/services/JobService");
      const result = await JobService.getById(supabase, "j1");
      expect(result).toEqual(job);
    });
  });

  describe("update", () => {
    it("delegates to repository with payload", async () => {
      const updated = { id: "j1", title: "Updated" };
      const builder = createMockQueryBuilder({ data: updated });
      const supabase = createMockSupabase({ jobs: builder });

      const { JobService } = await import("@/lib/services/JobService");
      const result = await JobService.update(supabase, "j1", {
        title: "Updated",
      });
      expect(result).toEqual(updated);
    });
  });

  describe("remove", () => {
    it("calls delete on the repository", async () => {
      const builder = createMockQueryBuilder();
      const supabase = createMockSupabase({ jobs: builder });

      const { JobService } = await import("@/lib/services/JobService");
      await JobService.remove(supabase, "j1");
      expect(builder.delete).toHaveBeenCalled();
      expect(builder.eq).toHaveBeenCalledWith("id", "j1");
    });
  });

  describe("getActiveByCompany", () => {
    it("filters by org and open status", async () => {
      const jobs = [{ id: "j1", title: "Open role", status: "open" }];
      const builder = createMockQueryBuilder({ data: jobs });
      const supabase = createMockSupabase({ jobs: builder });

      const { JobService } = await import("@/lib/services/JobService");
      const result = await JobService.getActiveByCompany(supabase, "org-1");
      expect(result).toEqual(jobs);
    });
  });
});

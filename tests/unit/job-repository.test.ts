import { describe, it, expect, vi } from "vitest";
import { createMockSupabase, createMockQueryBuilder } from "../helpers";

describe("JobRepository", () => {
  describe("getById", () => {
    it("returns a single job with organisation name", async () => {
      const job = {
        id: "j1",
        title: "Engineer",
        organisations: { name: "Acme" },
      };
      const builder = createMockQueryBuilder({ data: job });
      const supabase = createMockSupabase({ jobs: builder });

      const { JobRepository } = await import("@/lib/repositories/JobRepository");
      const result = await JobRepository.getById(supabase, "j1");

      expect(result).toEqual(job);
      expect(builder.select).toHaveBeenCalledWith(
        "*, organisations!jobs_organisation_id_fkey(name), hiring_requests!jobs_hiring_request_id_fkey(id, req_code, title, status, headcount)",
      );
      expect(builder.eq).toHaveBeenCalledWith("id", "j1");
    });

    it("throws on error", async () => {
      const builder = createMockQueryBuilder({
        error: { message: "not found" },
      });
      const supabase = createMockSupabase({ jobs: builder });

      const { JobRepository } = await import("@/lib/repositories/JobRepository");
      await expect(JobRepository.getById(supabase, "j-bad")).rejects.toBeDefined();
    });
  });

  describe("list", () => {
    it("uses compact counts without scanning individual fit scores, retaining tenant and manager filters", async () => {
      const rows = [{ id: "j-1", title: "Engineer", applications: [{ count: 1501 }] }];
      const builder = createMockQueryBuilder({ data: rows, count: 25 });
      const supabase = createMockSupabase({ jobs: builder });
      const { JobRepository, JOB_LIST_SUMMARY_COLUMNS } =
        await import("@/lib/repositories/JobRepository");
      const result = await JobRepository.list(supabase, {
        page: 2,
        limit: 20,
        view: "summary",
        organisationId: "org-1",
        hiringManagerId: "hm-1",
        status: "closed",
      });
      expect(result.jobs).toEqual(rows);
      expect(result.total).toBe(25);
      expect(builder.select).toHaveBeenCalledWith(JOB_LIST_SUMMARY_COLUMNS, { count: "exact" });
      expect(JOB_LIST_SUMMARY_COLUMNS).not.toContain("*");
      expect(builder.eq).toHaveBeenCalledWith("organisation_id", "org-1");
      expect(builder.eq).toHaveBeenCalledWith("hiring_manager_id", "hm-1");
      expect(builder.eq).toHaveBeenCalledWith("status", "closed");
      expect(builder.range).toHaveBeenCalledWith(20, 39);
      expect(supabase.from).toHaveBeenCalledTimes(1);
    });

    it("applies search filter with sanitized characters", async () => {
      const builder = createMockQueryBuilder({ data: [], count: 0 });
      const supabase = createMockSupabase({ jobs: builder });

      const { JobRepository } = await import("@/lib/repositories/JobRepository");
      await JobRepository.list(supabase, {
        page: 1,
        limit: 10,
        search: "eng%ineer",
      });

      const orArg = (builder.or as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(orArg).toContain("engineer");
      expect(orArg).not.toContain("eng%ineer");
    });

    it("filters by status", async () => {
      const builder = createMockQueryBuilder({ data: [], count: 0 });
      const supabase = createMockSupabase({ jobs: builder });

      const { JobRepository } = await import("@/lib/repositories/JobRepository");
      await JobRepository.list(supabase, {
        page: 1,
        limit: 10,
        status: "open",
      });

      expect(builder.eq).toHaveBeenCalledWith("status", "open");
    });

    it("forces open status for candidateView", async () => {
      const builder = createMockQueryBuilder({ data: [], count: 0 });
      const supabase = createMockSupabase({ jobs: builder });

      const { JobRepository } = await import("@/lib/repositories/JobRepository");
      await JobRepository.list(supabase, {
        page: 1,
        limit: 10,
        candidateView: true,
      });

      expect(builder.eq).toHaveBeenCalledWith("status", "open");
    });

    it("applies cursor-based pagination", async () => {
      const builder = createMockQueryBuilder({ data: [], count: 0 });
      const supabase = createMockSupabase({ jobs: builder });

      const { JobRepository } = await import("@/lib/repositories/JobRepository");
      await JobRepository.list(supabase, {
        page: 1,
        limit: 10,
        cursor: "2026-01-01T00:00:00Z",
      });

      expect(builder.lt).toHaveBeenCalledWith("created_at", "2026-01-01T00:00:00Z");
    });

    it("applies offset pagination when no cursor", async () => {
      const builder = createMockQueryBuilder({ data: [], count: 0 });
      const supabase = createMockSupabase({ jobs: builder });

      const { JobRepository } = await import("@/lib/repositories/JobRepository");
      await JobRepository.list(supabase, { page: 3, limit: 10 });

      expect(builder.range).toHaveBeenCalledWith(20, 29);
    });
  });

  describe("create", () => {
    it("inserts and returns created job", async () => {
      const job = { id: "j-new", title: "PM" };
      const builder = createMockQueryBuilder({ data: job });
      const supabase = createMockSupabase({ jobs: builder });

      const { JobRepository } = await import("@/lib/repositories/JobRepository");
      const result = await JobRepository.create(supabase, { title: "PM" });

      expect(result).toEqual(job);
      expect(builder.insert).toHaveBeenCalledWith({ title: "PM" });
    });
  });

  describe("update", () => {
    it("updates and adds updated_at timestamp", async () => {
      const updated = { id: "j1", title: "Updated" };
      const builder = createMockQueryBuilder({ data: updated });
      const supabase = createMockSupabase({ jobs: builder });

      const { JobRepository } = await import("@/lib/repositories/JobRepository");
      const result = await JobRepository.update(supabase, "j1", {
        title: "Updated",
      });

      expect(result).toEqual(updated);
      const updateCall = (builder.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateCall.updated_at).toBeDefined();
    });
  });

  describe("remove", () => {
    it("deletes a job by id", async () => {
      const builder = createMockQueryBuilder();
      const supabase = createMockSupabase({ jobs: builder });

      const { JobRepository } = await import("@/lib/repositories/JobRepository");
      await JobRepository.remove(supabase, "j1");

      expect(builder.delete).toHaveBeenCalled();
      expect(builder.eq).toHaveBeenCalledWith("id", "j1");
    });
  });

  describe("getActiveByCompany", () => {
    it("filters by organisation and open status", async () => {
      const jobs = [{ id: "j1", title: "Role", status: "open" }];
      const builder = createMockQueryBuilder({ data: jobs });
      const supabase = createMockSupabase({ jobs: builder });

      const { JobRepository } = await import("@/lib/repositories/JobRepository");
      const result = await JobRepository.getActiveByCompany(supabase, "org-1");

      expect(result).toEqual(jobs);
      expect(builder.eq).toHaveBeenCalledWith("organisation_id", "org-1");
      expect(builder.eq).toHaveBeenCalledWith("status", "open");
    });
  });

  describe("getJobIds", () => {
    it("returns array of job IDs for organisation", async () => {
      const builder = createMockQueryBuilder({
        data: [{ id: "j1" }, { id: "j2" }],
      });
      const supabase = createMockSupabase({ jobs: builder });

      const { JobRepository } = await import("@/lib/repositories/JobRepository");
      const ids = await JobRepository.getJobIds(supabase, {
        organisationId: "org-1",
      });

      expect(ids).toEqual(["j1", "j2"]);
    });
  });

  describe("markShortlistDelivered", () => {
    it("updates shortlist_delivered_at", async () => {
      const builder = createMockQueryBuilder();
      const supabase = createMockSupabase({ jobs: builder });

      const { JobRepository } = await import("@/lib/repositories/JobRepository");
      await JobRepository.markShortlistDelivered(supabase, "j1");

      const updateCall = (builder.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateCall.shortlist_delivered_at).toBeDefined();
    });
  });
});

import { describe, it, expect, vi } from "vitest";
import { createMockSupabase, createMockQueryBuilder } from "../helpers";

describe("ApplicationRepository", () => {
  describe("getById", () => {
    it("returns application with joined data", async () => {
      const app = {
        id: "a1",
        status: "applied",
        jobs: { id: "j1", title: "Eng" },
        candidates: { id: "c1", name: "Jane" },
      };
      const builder = createMockQueryBuilder({ data: app });
      const supabase = createMockSupabase({ applications: builder });

      const { ApplicationRepository } = await import("@/lib/repositories/ApplicationRepository");
      const result = await ApplicationRepository.getById(supabase, "a1");

      expect(result).toEqual(app);
      expect(builder.select).toHaveBeenCalledWith(expect.stringContaining("jobs"));
    });

    it("throws on error", async () => {
      const builder = createMockQueryBuilder({
        error: { message: "not found" },
      });
      const supabase = createMockSupabase({ applications: builder });

      const { ApplicationRepository } = await import("@/lib/repositories/ApplicationRepository");
      await expect(ApplicationRepository.getById(supabase, "a-bad")).rejects.toBeDefined();
    });
  });

  describe("listForCandidate", () => {
    it("filters by candidate_id and returns pagination info", async () => {
      const apps = [{ id: "a1", created_at: "2026-01-01" }];
      const builder = createMockQueryBuilder({ data: apps, count: 1 });
      const supabase = createMockSupabase({ applications: builder });

      const { ApplicationRepository } = await import("@/lib/repositories/ApplicationRepository");
      const result = await ApplicationRepository.listForCandidate(supabase, "c1", {
        page: 1,
        limit: 10,
      });

      expect(result.applications).toEqual(apps);
      expect(result.total).toBe(1);
      expect(builder.eq).toHaveBeenCalledWith("candidate_id", "c1");
    });

    it("applies status filter", async () => {
      const builder = createMockQueryBuilder({ data: [], count: 0 });
      const supabase = createMockSupabase({ applications: builder });

      const { ApplicationRepository } = await import("@/lib/repositories/ApplicationRepository");
      await ApplicationRepository.listForCandidate(supabase, "c1", {
        page: 1,
        limit: 10,
        status: "shortlisted",
      });

      expect(builder.eq).toHaveBeenCalledWith("status", "shortlisted");
    });
  });

  describe("listForRecruiter", () => {
    it("returns all applications with joins", async () => {
      const apps = [{ id: "a1" }, { id: "a2" }];
      const builder = createMockQueryBuilder({ data: apps, count: 2 });
      const supabase = createMockSupabase({ applications: builder });

      const { ApplicationRepository } = await import("@/lib/repositories/ApplicationRepository");
      const result = await ApplicationRepository.listForRecruiter(supabase, {
        page: 1,
        limit: 10,
      });

      expect(result.applications).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it("filters by job_id", async () => {
      const builder = createMockQueryBuilder({ data: [], count: 0 });
      const supabase = createMockSupabase({ applications: builder });

      const { ApplicationRepository } = await import("@/lib/repositories/ApplicationRepository");
      await ApplicationRepository.listForRecruiter(supabase, {
        page: 1,
        limit: 10,
        jobId: "j1",
      });

      expect(builder.eq).toHaveBeenCalledWith("job_id", "j1");
    });
  });

  it("filters candidate names and related fields before pagination", async () => {
    const builder = createMockQueryBuilder({ data: [{ id: "outside-first-page" }], count: 251 });
    const supabase = createMockSupabase({ applications: builder });
    const { ApplicationRepository } = await import("@/lib/repositories/ApplicationRepository");
    const result = await ApplicationRepository.listForRecruiter(supabase, {
      page: 2,
      limit: 30,
      search: "Jane",
      jobTitle: "Engineer",
      location: "Hyderabad",
      highIntentOnly: true,
    });
    expect(builder.select).toHaveBeenCalledWith(expect.stringContaining("candidates!inner("), {
      count: "exact",
    });
    expect(builder.select).toHaveBeenCalledWith(expect.stringContaining("jobs!inner("), {
      count: "exact",
    });
    expect(builder.ilike).toHaveBeenCalledWith("candidates.name", "%Jane%");
    expect(builder.eq).toHaveBeenCalledWith("candidates.location", "Hyderabad");
    expect(builder.gte).toHaveBeenCalledWith("candidates.intent_score", 60);
    expect(builder.range).toHaveBeenCalledWith(30, 59);
    expect(result.total).toBe(251);
  });

  it("reports all review matches rather than the current batch length", async () => {
    const builder = createMockQueryBuilder({ data: [{ id: "app-1" }], count: 251 });
    const supabase = createMockSupabase({ applications: builder });
    const { ApplicationRepository } = await import("@/lib/repositories/ApplicationRepository");
    const result = await ApplicationRepository.listForRecruiterReview(supabase, {
      page: 1,
      limit: 100,
    });
    expect(result.total).toBe(251);
  });

  it("ranks the first pending review page from stored scores", async () => {
    const score = createMockQueryBuilder({
      data: [{ candidate_id: "c-high", overall_score: 99, evidence_json: null }],
    });
    const counted = createMockQueryBuilder({ data: null, count: 4 });
    const apps = createMockQueryBuilder({
      data: [{ id: "app-high", candidate_id: "c-high" }],
    });
    const supabase = createMockSupabase({ fit_scores: score });
    let calls = 0;
    supabase.from = vi.fn((table: string) =>
      table === "fit_scores" ? score : calls++ === 0 ? counted : apps,
    ) as typeof supabase.from;
    const { ApplicationRepository } = await import("@/lib/repositories/ApplicationRepository");
    const result = await ApplicationRepository.listForRecruiterReview(supabase, {
      page: 1,
      limit: 100,
      jobId: "job-1",
      status: "applied",
      reviewOrder: "score",
    });
    expect(score.order).toHaveBeenCalledWith("overall_score", { ascending: false });
    expect(result.applications[0].id).toBe("app-high");
    expect(result.total).toBe(4);
  });

  describe("create", () => {
    it("inserts application", async () => {
      const app = { id: "a-new", status: "applied" };
      const builder = createMockQueryBuilder({ data: app });
      const supabase = createMockSupabase({ applications: builder });

      const { ApplicationRepository } = await import("@/lib/repositories/ApplicationRepository");
      const result = await ApplicationRepository.create(supabase, {
        candidate_id: "c1",
        job_id: "j1",
        status: "applied",
      });

      expect(result).toEqual(app);
    });
  });

  describe("updateStatus", () => {
    it("updates status and adds updated_at", async () => {
      const updated = { id: "a1", status: "hired" };
      const builder = createMockQueryBuilder({ data: updated });
      const supabase = createMockSupabase({ applications: builder });

      const { ApplicationRepository } = await import("@/lib/repositories/ApplicationRepository");
      const result = await ApplicationRepository.updateStatus(supabase, "a1", {
        status: "hired",
      });

      expect(result).toEqual(updated);
      const updateCall = (builder.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateCall.updated_at).toBeDefined();
    });
  });

  describe("findExistingScore", () => {
    it("returns score ID when found", async () => {
      const builder = createMockQueryBuilder({ data: { id: "fs-1" } });
      const supabase = createMockSupabase({ fit_scores: builder });

      const { ApplicationRepository } = await import("@/lib/repositories/ApplicationRepository");
      const result = await ApplicationRepository.findExistingScore(supabase, "c1", "j1");
      expect(result).toBe("fs-1");
    });

    it("returns null when no existing score", async () => {
      const builder = createMockQueryBuilder({ data: null });
      const supabase = createMockSupabase({ fit_scores: builder });

      const { ApplicationRepository } = await import("@/lib/repositories/ApplicationRepository");
      const result = await ApplicationRepository.findExistingScore(supabase, "c1", "j-no");
      expect(result).toBeNull();
    });
  });
});

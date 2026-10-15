import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, createMockQueryBuilder } from "../helpers";

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/security/pii", () => ({
  maskCandidateForShortlist: vi.fn((c: Record<string, unknown>, unlocked: boolean) => {
    if (unlocked) return c;
    return {
      ...c,
      phone: null,
      email: null,
      full_name: "J D.",
      cv_url: null,
      linkedin_url: null,
    };
  }),
}));

describe("CandidateService", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("listMasked", () => {
    it("returns masked candidates with pagination", async () => {
      const candidates = [
        {
          id: "c1",
          name: "Jane Doe",
          phone: "555-1234",
          email: "jane@example.com",
        },
        {
          id: "c2",
          name: "John Smith",
          phone: "555-5678",
          email: "john@example.com",
        },
      ];
      const builder = createMockQueryBuilder({ data: candidates, count: 2 });
      const supabase = createMockSupabase({ candidates: builder });

      const { CandidateService } = await import("@/lib/services/CandidateService");
      const result = await CandidateService.listMasked(supabase, {
        page: 1,
        limit: 10,
        sortBy: "created_at",
        sortOrder: "desc",
      });

      expect(result.candidates).toHaveLength(2);
      expect(result.candidates[0].phone).toBeNull();
      expect(result.candidates[0].email).toBeNull();
      expect(result.pagination.total).toBe(2);
    });

    it("calculates totalPages correctly", async () => {
      const builder = createMockQueryBuilder({ data: [], count: 45 });
      const supabase = createMockSupabase({ candidates: builder });

      const { CandidateService } = await import("@/lib/services/CandidateService");
      const result = await CandidateService.listMasked(supabase, {
        page: 1,
        limit: 20,
        sortBy: "created_at",
        sortOrder: "desc",
      });

      expect(result.pagination.totalPages).toBe(3);
    });
  });

  describe("getByUserId", () => {
    it("returns candidate record", async () => {
      const candidate = { id: "c1", user_id: "u1", name: "Jane" };
      const builder = createMockQueryBuilder({ data: candidate });
      const supabase = createMockSupabase({ candidates: builder });

      const { CandidateService } = await import("@/lib/services/CandidateService");
      const result = await CandidateService.getByUserId(supabase, "u1");
      expect(result).toEqual(candidate);
    });

    it("returns null when candidate not found", async () => {
      const builder = createMockQueryBuilder({ data: null });
      const supabase = createMockSupabase({ candidates: builder });

      const { CandidateService } = await import("@/lib/services/CandidateService");
      const result = await CandidateService.getByUserId(supabase, "u-nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("eraseData", () => {
    it.each([
      ["vouches", "Could not erase candidate vouches"],
      ["fit_scores", "Could not redact candidate scores"],
      ["candidates", "Could not load candidate CV references"],
      ["candidate_profile_cache", "Could not erase candidate profile cache"],
      ["fitscore_extraction_log", "Could not erase candidate extraction log"],
      ["retention_deletions", "Could not record candidate erasure"],
    ])("rejects %s failure instead of declaring completion", async (table, message) => {
      const failed = createMockQueryBuilder({ error: { message: "denied" } });
      const retention = table === "retention_deletions" ? failed : createMockQueryBuilder();
      const supabase = createMockSupabase({ [table]: failed, retention_deletions: retention });
      const { CandidateService } = await import("@/lib/services/CandidateService");
      await expect(CandidateService.eraseData(supabase, "c1")).rejects.toThrow(message);
      if (table !== "retention_deletions") expect(retention.insert).not.toHaveBeenCalled();
    });

    it("does not report erasure success when career deletion fails", async () => {
      const careerBuilder = createMockQueryBuilder({ data: null, error: { message: "denied" } });
      const retentionBuilder = createMockQueryBuilder();
      const supabase = createMockSupabase({
        candidate_career_profiles: careerBuilder,
        retention_deletions: retentionBuilder,
      });
      const { CandidateService } = await import("@/lib/services/CandidateService");
      await expect(CandidateService.eraseData(supabase, "c1")).rejects.toThrow(
        "Could not erase career details",
      );
      expect(careerBuilder.delete).toHaveBeenCalled();
      expect(careerBuilder.eq).toHaveBeenCalledWith("candidate_id", "c1");
      expect(retentionBuilder.insert).not.toHaveBeenCalled();
    });

    it("deletes the stored CV objects and records cv:true only when that succeeds", async () => {
      const candidatesBuilder = createMockQueryBuilder({
        data: {
          resume_url:
            "https://x.supabase.co/storage/v1/object/sign/candidate-cvs/cvs/a.pdf?token=abc",
          cv_url: "https://x.supabase.co/storage/v1/object/public/candidate-cvs/cvs/a.pdf",
        },
        error: null,
      });
      const retentionBuilder = createMockQueryBuilder();
      const remove = vi.fn().mockResolvedValue({ data: [{ name: "cvs/a.pdf" }], error: null });
      const supabase = createMockSupabase({
        vouches: createMockQueryBuilder(),
        fit_scores: createMockQueryBuilder(),
        candidates: candidatesBuilder,
        retention_deletions: retentionBuilder,
        candidate_profile_cache: createMockQueryBuilder(),
        fitscore_extraction_log: createMockQueryBuilder(),
        candidate_resume_versions: createMockQueryBuilder({ data: [], error: null }),
      });
      (supabase as unknown as { storage: unknown }).storage = {
        from: vi.fn(() => ({ remove })),
      };

      const { CandidateService } = await import("@/lib/services/CandidateService");
      await CandidateService.eraseData(supabase, "c1");

      // Both URLs point at the same object; the path is de-duplicated and stripped
      // of the signed-URL query string.
      expect(remove).toHaveBeenCalledWith(["cvs/a.pdf"]);
      const logged = retentionBuilder.insert.mock.calls[0][0] as {
        data_deleted: { cv: boolean };
      };
      expect(logged.data_deleted.cv).toBe(true);
    });

    it("records cv:false and keeps the request retryable when the storage delete fails", async () => {
      const candidatesBuilder = createMockQueryBuilder({
        data: {
          resume_url: "https://x/storage/v1/object/sign/candidate-cvs/cvs/b.pdf",
          cv_url: null,
        },
        error: null,
      });
      const retentionBuilder = createMockQueryBuilder();
      const supabase = createMockSupabase({
        vouches: createMockQueryBuilder(),
        fit_scores: createMockQueryBuilder(),
        candidates: candidatesBuilder,
        retention_deletions: retentionBuilder,
        candidate_profile_cache: createMockQueryBuilder(),
        fitscore_extraction_log: createMockQueryBuilder(),
        candidate_resume_versions: createMockQueryBuilder({ data: [], error: null }),
      });
      (supabase as unknown as { storage: unknown }).storage = {
        from: vi.fn(() => ({
          remove: vi.fn().mockResolvedValue({ data: null, error: { message: "denied" } }),
        })),
      };

      const { CandidateService } = await import("@/lib/services/CandidateService");
      await expect(CandidateService.eraseData(supabase, "c1")).rejects.toThrow(
        "CV erasure incomplete",
      );

      // A failed delete must never be recorded as a completed erasure.
      const logged = retentionBuilder.insert.mock.calls[0][0] as {
        data_deleted: { cv: boolean };
      };
      expect(logged.data_deleted.cv).toBe(false);
    });

    it.each([
      [false, { status: 404 }, true],
      [false, { status: 403 }, false],
      [true, null, false],
    ])(
      "only accepts already-deleted storage objects after verified absence (%s, %j)",
      async (exists, error, succeeds) => {
        const candidates = createMockQueryBuilder({
          data: { resume_url: "https://x/storage/v1/object/public/resumes/cv.pdf" },
        });
        const retention = createMockQueryBuilder();
        const supabase = createMockSupabase({ candidates, retention_deletions: retention });
        (supabase as unknown as { storage: unknown }).storage = {
          from: () => ({
            remove: async () => ({ data: [], error: null }),
            exists: async () => ({ data: exists, error }),
          }),
        };
        const { CandidateService } = await import("@/lib/services/CandidateService");
        if (succeeds)
          await expect(CandidateService.eraseData(supabase, "c1")).resolves.toBeUndefined();
        else
          await expect(CandidateService.eraseData(supabase, "c1")).rejects.toThrow(
            "CV erasure incomplete",
          );
        expect(retention.insert).toHaveBeenCalledWith(
          expect.objectContaining({ data_deleted: expect.objectContaining({ cv: succeeds }) }),
        );
      },
    );

    it("deletes vouches, nullifies fit_scores, erases candidate, and logs deletion", async () => {
      const vouchesBuilder = createMockQueryBuilder();
      const fitScoresBuilder = createMockQueryBuilder();
      const candidatesBuilder = createMockQueryBuilder({
        data: { resume_url: null, cv_url: null },
        error: null,
      });
      const retentionBuilder = createMockQueryBuilder();
      const profileCacheBuilder = createMockQueryBuilder();
      const extractionLogBuilder = createMockQueryBuilder();
      const careerBuilder = createMockQueryBuilder();

      const supabase = createMockSupabase({
        vouches: vouchesBuilder,
        fit_scores: fitScoresBuilder,
        candidates: candidatesBuilder,
        retention_deletions: retentionBuilder,
        candidate_profile_cache: profileCacheBuilder,
        fitscore_extraction_log: extractionLogBuilder,
        candidate_career_profiles: careerBuilder,
      });

      const { CandidateService } = await import("@/lib/services/CandidateService");
      await CandidateService.eraseData(supabase, "c1");

      expect(supabase.from).toHaveBeenCalledWith("vouches");
      expect(vouchesBuilder.delete).toHaveBeenCalled();
      expect(careerBuilder.delete).toHaveBeenCalled();
      expect(careerBuilder.eq).toHaveBeenCalledWith("candidate_id", "c1");

      expect(supabase.from).toHaveBeenCalledWith("fit_scores");
      expect(fitScoresBuilder.update).toHaveBeenCalledWith({
        summary: null,
        green_flags: null,
        amber_flags: null,
        red_flags: null,
      });

      expect(supabase.from).toHaveBeenCalledWith("candidates");

      // PII-004: candidate-derived fit-score caches/logs are purged.
      expect(supabase.from).toHaveBeenCalledWith("candidate_profile_cache");
      expect(profileCacheBuilder.delete).toHaveBeenCalled();
      expect(profileCacheBuilder.eq).toHaveBeenCalledWith("candidate_id", "c1");
      expect(supabase.from).toHaveBeenCalledWith("fitscore_extraction_log");
      expect(extractionLogBuilder.delete).toHaveBeenCalled();
      expect(extractionLogBuilder.eq).toHaveBeenCalledWith("candidate_id", "c1");

      // jd_intel_cache is job-keyed (not candidate PII) and must NOT be touched.
      expect(supabase.from).not.toHaveBeenCalledWith("jd_intel_cache");

      expect(supabase.from).toHaveBeenCalledWith("retention_deletions");
      expect(retentionBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          candidate_id: "c1",
          deletion_reason: "erasure_request",
          data_deleted: expect.objectContaining({
            profile_cache: true,
            extraction_log: true,
          }),
        }),
      );
    });
  });
});

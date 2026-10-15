import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, createMockQueryBuilder } from "../helpers";

// The accessible-candidate RPCs are SECURITY DEFINER and revoked from
// anon/authenticated, so the repository calls them via the service-role admin
// client. Mock that client with a controllable rpc spy.
const { adminRpc } = vi.hoisted(() => ({ adminRpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ rpc: adminRpc }),
}));

beforeEach(() => {
  adminRpc.mockReset();
});

describe("CandidateRepository", () => {
  describe("getById", () => {
    it("returns a single candidate", async () => {
      const candidate = { id: "c1", name: "Jane" };
      const builder = createMockQueryBuilder({ data: candidate });
      const supabase = createMockSupabase({ candidates: builder });

      const { CandidateRepository } = await import("@/lib/repositories/CandidateRepository");
      const result = await CandidateRepository.getById(supabase, "c1");
      expect(result).toEqual(candidate);
    });

    it("throws on error", async () => {
      const builder = createMockQueryBuilder({
        error: { message: "not found" },
      });
      const supabase = createMockSupabase({ candidates: builder });

      const { CandidateRepository } = await import("@/lib/repositories/CandidateRepository");
      await expect(CandidateRepository.getById(supabase, "c-bad")).rejects.toBeDefined();
    });
  });

  describe("getByUserId", () => {
    it("returns candidate for user", async () => {
      const candidate = { id: "c1", user_id: "u1" };
      const builder = createMockQueryBuilder({ data: candidate });
      const supabase = createMockSupabase({ candidates: builder });

      const { CandidateRepository } = await import("@/lib/repositories/CandidateRepository");
      const result = await CandidateRepository.getByUserId(supabase, "u1");
      expect(result).toEqual(candidate);
    });
  });

  describe("list", () => {
    it("applies search filter with sanitized input", async () => {
      const builder = createMockQueryBuilder({ data: [], count: 0 });
      const supabase = createMockSupabase({ candidates: builder });

      const { CandidateRepository } = await import("@/lib/repositories/CandidateRepository");
      await CandidateRepository.list(supabase, {
        page: 1,
        limit: 10,
        search: "jane%doe",
        sortBy: "created_at",
        sortOrder: "desc",
      });

      expect(builder.or).toHaveBeenCalledWith(expect.stringContaining("janedoe"));
    });

    it("applies skills overlap filter", async () => {
      const builder = createMockQueryBuilder({ data: [], count: 0 });
      const supabase = createMockSupabase({ candidates: builder });

      const { CandidateRepository } = await import("@/lib/repositories/CandidateRepository");
      await CandidateRepository.list(supabase, {
        page: 1,
        limit: 10,
        skills: "React, TypeScript",
        sortBy: "created_at",
        sortOrder: "desc",
      });

      expect(builder.overlaps).toHaveBeenCalledWith("skills", ["React", "TypeScript"]);
    });

    it("applies location filter", async () => {
      const builder = createMockQueryBuilder({ data: [], count: 0 });
      const supabase = createMockSupabase({ candidates: builder });

      const { CandidateRepository } = await import("@/lib/repositories/CandidateRepository");
      await CandidateRepository.list(supabase, {
        page: 1,
        limit: 10,
        location: "Mumbai",
        sortBy: "created_at",
        sortOrder: "desc",
      });

      expect(builder.ilike).toHaveBeenCalledWith("location", "%Mumbai%");
    });

    it("applies intent score filter", async () => {
      const builder = createMockQueryBuilder({ data: [], count: 0 });
      const supabase = createMockSupabase({ candidates: builder });

      const { CandidateRepository } = await import("@/lib/repositories/CandidateRepository");
      await CandidateRepository.list(supabase, {
        page: 1,
        limit: 10,
        minIntentScore: 50,
        sortBy: "created_at",
        sortOrder: "desc",
      });

      expect(builder.gte).toHaveBeenCalledWith("intent_score", 50);
    });

    it("applies experience range filters", async () => {
      const builder = createMockQueryBuilder({ data: [], count: 0 });
      const supabase = createMockSupabase({ candidates: builder });

      const { CandidateRepository } = await import("@/lib/repositories/CandidateRepository");
      await CandidateRepository.list(supabase, {
        page: 1,
        limit: 10,
        minExperience: 2,
        maxExperience: 8,
        sortBy: "created_at",
        sortOrder: "desc",
      });

      expect(builder.gte).toHaveBeenCalledWith("experience_years", 2);
      expect(builder.lte).toHaveBeenCalledWith("experience_years", 8);
    });

    it("uses offset pagination when no cursor", async () => {
      const builder = createMockQueryBuilder({ data: [], count: 0 });
      const supabase = createMockSupabase({ candidates: builder });

      const { CandidateRepository } = await import("@/lib/repositories/CandidateRepository");
      await CandidateRepository.list(supabase, {
        page: 2,
        limit: 20,
        sortBy: "created_at",
        sortOrder: "desc",
      });

      expect(builder.range).toHaveBeenCalledWith(20, 39);
    });

    it("filters only visible candidates", async () => {
      const builder = createMockQueryBuilder({ data: [], count: 0 });
      const supabase = createMockSupabase({ candidates: builder });

      const { CandidateRepository } = await import("@/lib/repositories/CandidateRepository");
      await CandidateRepository.list(supabase, {
        page: 1,
        limit: 10,
        sortBy: "created_at",
        sortOrder: "desc",
      });

      expect(builder.eq).toHaveBeenCalledWith("visibility", true);
    });

    it("uses ascending cursor pagination when sortOrder is asc", async () => {
      const builder = createMockQueryBuilder({ data: [], count: 0 });
      const supabase = createMockSupabase({ candidates: builder });

      const { CandidateRepository } = await import("@/lib/repositories/CandidateRepository");
      await CandidateRepository.list(supabase, {
        page: 1,
        limit: 10,
        cursor: "cursor-1",
        sortBy: "created_at",
        sortOrder: "asc",
      });

      expect(builder.gt).toHaveBeenCalledWith("id", "cursor-1");
      expect(builder.limit).toHaveBeenCalledWith(11);
    });

    it("narrows list by jobId fit-score scope", async () => {
      const fitBuilder = createMockQueryBuilder({
        data: [{ candidate_id: "c-job" }],
      });
      const candidatesBuilder = createMockQueryBuilder({
        data: [{ id: "c-job", name: "Pat" }],
        count: 1,
      });
      const supabase = createMockSupabase({
        fit_scores: fitBuilder,
        candidates: candidatesBuilder,
      });

      const { CandidateRepository } = await import("@/lib/repositories/CandidateRepository");
      await CandidateRepository.list(supabase, {
        page: 1,
        limit: 10,
        jobId: "job-42",
        sortBy: "created_at",
        sortOrder: "desc",
      });

      expect(fitBuilder.eq).toHaveBeenCalledWith("job_id", "job-42");
      expect(candidatesBuilder.in).toHaveBeenCalledWith("id", ["c-job"]);
    });

    it("narrows list by role_function job scope", async () => {
      const jobsBuilder = createMockQueryBuilder({
        data: [{ id: "j-a" }, { id: "j-b" }],
      });
      const fitBuilder = createMockQueryBuilder({
        data: [{ candidate_id: "c-rf" }],
      });
      const candidatesBuilder = createMockQueryBuilder({
        data: [{ id: "c-rf" }],
        count: 1,
      });
      const supabase = createMockSupabase({
        jobs: jobsBuilder,
        fit_scores: fitBuilder,
        candidates: candidatesBuilder,
      });

      const { CandidateRepository } = await import("@/lib/repositories/CandidateRepository");
      await CandidateRepository.list(supabase, {
        page: 1,
        limit: 10,
        roleFunction: "Engineering",
        sortBy: "created_at",
        sortOrder: "desc",
      });

      expect(jobsBuilder.ilike).toHaveBeenCalledWith("role_function", "Engineering");
      expect(fitBuilder.in).toHaveBeenCalledWith("job_id", ["j-a", "j-b"]);
    });

    it("returns empty list when job scope finds no candidates", async () => {
      const fitBuilder = createMockQueryBuilder({ data: [] });
      const candidatesBuilder = createMockQueryBuilder({
        data: [{ id: "c-other" }],
        count: 1,
      });
      const supabase = createMockSupabase({
        fit_scores: fitBuilder,
        candidates: candidatesBuilder,
      });

      const { CandidateRepository } = await import("@/lib/repositories/CandidateRepository");
      const result = await CandidateRepository.list(supabase, {
        page: 1,
        limit: 10,
        jobId: "job-empty",
        sortBy: "created_at",
        sortOrder: "desc",
      });

      expect(result.candidates).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("lists via RPC when accessibleOrganisationIds is set", async () => {
      const candidatesBuilder = createMockQueryBuilder({
        data: [{ id: "c-rpc", name: "RPC" }],
      });
      const supabase = createMockSupabase({
        candidates: candidatesBuilder,
      });
      adminRpc.mockResolvedValue({
        data: [{ id: "c-rpc", total_count: 12 }],
        error: null,
      });

      const { CandidateRepository } = await import("@/lib/repositories/CandidateRepository");
      const result = await CandidateRepository.list(supabase, {
        page: 1,
        limit: 10,
        sortBy: "created_at",
        sortOrder: "desc",
        accessibleOrganisationIds: ["org-a"],
      });

      expect(adminRpc).toHaveBeenCalledWith(
        "list_accessible_candidate_ids_page",
        expect.objectContaining({
          p_organisation_ids: ["org-a"],
          p_job_id: null,
        }),
      );
      expect(result.candidates).toHaveLength(1);
      expect(result.total).toBe(12);
    });

    it("falls back to ID union query when RPC fails", async () => {
      const unlocksBuilder = createMockQueryBuilder({
        data: [{ candidate_id: "c-fb" }],
      });
      const jobsBuilder = createMockQueryBuilder({ data: [] });
      const candidatesBuilder = createMockQueryBuilder({
        data: [{ id: "c-fb", name: "Fallback" }],
        count: 1,
      });
      const supabase = createMockSupabase({
        candidates: candidatesBuilder,
        candidate_unlocks: unlocksBuilder,
        jobs: jobsBuilder,
      });
      adminRpc.mockResolvedValue({
        data: null,
        error: { message: "rpc missing" },
      });

      const { CandidateRepository } = await import("@/lib/repositories/CandidateRepository");
      const result = await CandidateRepository.list(supabase, {
        page: 1,
        limit: 10,
        sortBy: "created_at",
        sortOrder: "desc",
        accessibleOrganisationIds: ["org-x"],
      });

      expect(result.candidates).toHaveLength(1);
      expect(candidatesBuilder.in).toHaveBeenCalledWith("id", ["c-fb"]);
    });
  });

  describe("create", () => {
    it("inserts and returns candidate", async () => {
      const candidate = { id: "c-new", name: "New" };
      const builder = createMockQueryBuilder({ data: candidate });
      const supabase = createMockSupabase({ candidates: builder });

      const { CandidateRepository } = await import("@/lib/repositories/CandidateRepository");
      const result = await CandidateRepository.create(supabase, {
        name: "New",
      });
      expect(result).toEqual(candidate);
    });
  });

  describe("update", () => {
    it("adds updated_at timestamp", async () => {
      const updated = { id: "c1", name: "Updated" };
      const builder = createMockQueryBuilder({ data: updated });
      const supabase = createMockSupabase({ candidates: builder });

      const { CandidateRepository } = await import("@/lib/repositories/CandidateRepository");
      await CandidateRepository.update(supabase, "c1", { name: "Updated" });

      const updateCall = (builder.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateCall.updated_at).toBeDefined();
    });
  });

  describe("upsertByPhone", () => {
    it("upserts by phone conflict", async () => {
      const result = { id: "c1" };
      const builder = createMockQueryBuilder({ data: result });
      const supabase = createMockSupabase({ candidates: builder });

      const { CandidateRepository } = await import("@/lib/repositories/CandidateRepository");
      const res = await CandidateRepository.upsertByPhone(supabase, "+919876543210", {
        name: "Jane",
      });

      expect(res).toEqual(result);
      expect(builder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ phone: "+919876543210", name: "Jane" }),
        { onConflict: "phone" },
      );
    });
  });

  describe("eraseCandidate", () => {
    it("rejects a failed profile redaction", async () => {
      const builder = createMockQueryBuilder({ error: { message: "denied" } });
      const { CandidateRepository } = await import("@/lib/repositories/CandidateRepository");
      await expect(
        CandidateRepository.eraseCandidate(createMockSupabase({ candidates: builder }), "c1"),
      ).rejects.toThrow("Could not erase candidate profile");
    });
    it("nullifies PII fields", async () => {
      const builder = createMockQueryBuilder();
      const supabase = createMockSupabase({ candidates: builder });

      const { CandidateRepository } = await import("@/lib/repositories/CandidateRepository");
      await CandidateRepository.eraseCandidate(supabase, "c1");

      const updateCall = (builder.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateCall.phone).toBeNull();
      expect(updateCall.email).toBeNull();
      expect(updateCall.full_name).toBe("[ERASED]");
      expect(updateCall.cv_raw_text).toBeNull();
      expect(updateCall.linkedin_url).toBeNull();
      expect(updateCall.profile_embedding).toBeNull();
      expect(updateCall.name).toBe("[ERASED]");
      expect(updateCall).not.toHaveProperty("cv_parsed_json");
      expect(updateCall).not.toHaveProperty("embedding");
      expect(updateCall.erased_at).toBeDefined();
    });
  });

  describe("getAccessibleCandidateIdsForOrgs", () => {
    it("returns empty array when organisationIds is empty", async () => {
      const supabase = createMockSupabase({});

      const { getAccessibleCandidateIdsForOrgs } =
        await import("@/lib/repositories/CandidateRepository");
      const result = await getAccessibleCandidateIdsForOrgs(supabase, []);
      expect(result).toEqual([]);
    });

    it("uses RPC when org list has 50+ orgs", async () => {
      const orgIds = Array.from({ length: 50 }, (_, i) => `org-${i}`);
      const rpcData = ["c1", "c2", "c3"];
      const supabase = createMockSupabase({});
      adminRpc.mockResolvedValue({ data: rpcData, error: null });

      const { getAccessibleCandidateIdsForOrgs } =
        await import("@/lib/repositories/CandidateRepository");
      const result = await getAccessibleCandidateIdsForOrgs(supabase, orgIds);
      expect(adminRpc).toHaveBeenCalledWith("get_accessible_candidate_ids", {
        p_organisation_ids: orgIds,
      });
      expect(result).toEqual(rpcData);
    });

    it("falls back to client queries when RPC errors", async () => {
      const unlocksBuilder = createMockQueryBuilder({
        data: [{ candidate_id: "c1" }],
      });
      const jobsBuilder = createMockQueryBuilder({ data: [] });
      const supabase = createMockSupabase({
        candidate_unlocks: unlocksBuilder,
        jobs: jobsBuilder,
      });
      supabase.rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "RPC not found" } });

      const { getAccessibleCandidateIdsForOrgs } =
        await import("@/lib/repositories/CandidateRepository");
      const result = await getAccessibleCandidateIdsForOrgs(supabase, ["org-1", "org-2"]);
      expect(result).toContain("c1");
    });

    it("caps result at 5000 when RPC returns more", async () => {
      const orgIds = Array.from({ length: 50 }, (_, i) => `org-${i}`);
      const manyIds = Array.from({ length: 6000 }, (_, i) => `c-${i}`);
      const supabase = createMockSupabase({});
      adminRpc.mockResolvedValue({ data: manyIds, error: null });

      const { getAccessibleCandidateIdsForOrgs } =
        await import("@/lib/repositories/CandidateRepository");
      const result = await getAccessibleCandidateIdsForOrgs(supabase, orgIds);
      expect(result).toHaveLength(5000);
    });
  });

  describe("setProcessingStatus", () => {
    it("updates candidate processing_status", async () => {
      const builder = createMockQueryBuilder();
      const supabase = createMockSupabase({ candidates: builder });

      const { CandidateRepository } = await import("@/lib/repositories/CandidateRepository");
      await CandidateRepository.setProcessingStatus(supabase, "c1", "processing");

      expect(builder.update).toHaveBeenCalledWith({
        processing_status: "processing",
      });
      expect(builder.eq).toHaveBeenCalledWith("id", "c1");
    });
  });
});

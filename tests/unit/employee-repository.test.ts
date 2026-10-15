import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, createMockQueryBuilder } from "../helpers";

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/redis/auth-profile-cache", () => ({
  deleteCachedAuthProfile: vi.fn().mockResolvedValue(undefined),
}));

describe("EmployeeRepository", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("onboardAsEmployee", () => {
    it("updates candidate, profile, clears cache, and logs", async () => {
      const candidateUpdateBuilder = createMockQueryBuilder();
      const candidateSelectBuilder = createMockQueryBuilder({
        data: { user_id: "u1" },
      });
      const profileBuilder = createMockQueryBuilder();

      let candidateCallCount = 0;
      const supabase = createMockSupabase();
      (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
        if (table === "candidates") {
          candidateCallCount++;
          return candidateCallCount === 1 ? candidateUpdateBuilder : candidateSelectBuilder;
        }
        if (table === "profiles") return profileBuilder;
        return createMockQueryBuilder();
      });

      const { EmployeeRepository } = await import("@/lib/repositories/EmployeeRepository");
      const { deleteCachedAuthProfile } = await import("@/lib/redis/auth-profile-cache");
      const { logger } = await import("@/lib/observability/logger");

      const result = await EmployeeRepository.onboardAsEmployee(supabase, {
        candidateId: "c1",
        companyId: "comp-1",
      });

      expect(result).toEqual({
        candidateId: "c1",
        companyId: "comp-1",
        userId: "u1",
      });
      expect(candidateUpdateBuilder.update).toHaveBeenCalledWith({
        employment_status: "active_employee",
        employer_company_id: "comp-1",
      });
      expect(profileBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          role: "employee",
          organisation_id: "comp-1",
        }),
      );
      expect(deleteCachedAuthProfile).toHaveBeenCalledWith("u1");
      expect(logger.info).toHaveBeenCalledWith(
        "Candidate onboarded as employee",
        expect.objectContaining({
          candidateId: "c1",
          userId: "u1",
          companyId: "comp-1",
        }),
      );
    });

    it("throws when candidate update fails", async () => {
      const candidateBuilder = createMockQueryBuilder({
        error: { message: "update failed" },
      });
      const supabase = createMockSupabase({ candidates: candidateBuilder });

      const { EmployeeRepository } = await import("@/lib/repositories/EmployeeRepository");
      const { logger } = await import("@/lib/observability/logger");

      await expect(
        EmployeeRepository.onboardAsEmployee(supabase, {
          candidateId: "c1",
          companyId: "comp-1",
        }),
      ).rejects.toBeDefined();

      expect(logger.error).toHaveBeenCalledWith(
        "Failed to update candidate employment status",
        expect.objectContaining({ candidateId: "c1" }),
      );
    });

    it("throws when profile update fails", async () => {
      const candidateUpdateBuilder = createMockQueryBuilder();
      const candidateSelectBuilder = createMockQueryBuilder({
        data: { user_id: "u1" },
      });
      const profileBuilder = createMockQueryBuilder({
        error: { message: "profile update failed" },
      });

      let candidateCallCount = 0;
      const supabase = createMockSupabase();
      (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
        if (table === "candidates") {
          candidateCallCount++;
          return candidateCallCount === 1 ? candidateUpdateBuilder : candidateSelectBuilder;
        }
        if (table === "profiles") return profileBuilder;
        return createMockQueryBuilder();
      });

      const { EmployeeRepository } = await import("@/lib/repositories/EmployeeRepository");
      const { logger } = await import("@/lib/observability/logger");

      await expect(
        EmployeeRepository.onboardAsEmployee(supabase, {
          candidateId: "c1",
          companyId: "comp-1",
        }),
      ).rejects.toBeDefined();

      expect(logger.error).toHaveBeenCalledWith(
        "Failed to update profile to employee role",
        expect.objectContaining({ userId: "u1" }),
      );
    });

    it("handles unclaimed profile (no user_id)", async () => {
      const candidateUpdateBuilder = createMockQueryBuilder();
      const candidateSelectBuilder = createMockQueryBuilder({
        data: { user_id: null },
      });

      let candidateCallCount = 0;
      const supabase = createMockSupabase();
      (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
        if (table === "candidates") {
          candidateCallCount++;
          return candidateCallCount === 1 ? candidateUpdateBuilder : candidateSelectBuilder;
        }
        return createMockQueryBuilder();
      });

      const { EmployeeRepository } = await import("@/lib/repositories/EmployeeRepository");
      const { logger } = await import("@/lib/observability/logger");

      const result = await EmployeeRepository.onboardAsEmployee(supabase, {
        candidateId: "c1",
        companyId: "comp-1",
      });

      expect(result).toEqual({
        candidateId: "c1",
        companyId: "comp-1",
        userId: null,
      });
      expect(logger.info).toHaveBeenCalledWith(
        "Candidate onboarded as employee (unclaimed profile)",
        expect.objectContaining({ candidateId: "c1", companyId: "comp-1" }),
      );
    });

    it("handles null candidate data", async () => {
      const candidateUpdateBuilder = createMockQueryBuilder();
      const candidateSelectBuilder = createMockQueryBuilder({ data: null });

      let candidateCallCount = 0;
      const supabase = createMockSupabase();
      (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
        if (table === "candidates") {
          candidateCallCount++;
          return candidateCallCount === 1 ? candidateUpdateBuilder : candidateSelectBuilder;
        }
        return createMockQueryBuilder();
      });

      const { EmployeeRepository } = await import("@/lib/repositories/EmployeeRepository");

      const result = await EmployeeRepository.onboardAsEmployee(supabase, {
        candidateId: "c1",
        companyId: "comp-1",
      });

      expect(result.userId).toBeNull();
    });
  });

  describe("createInvite", () => {
    it("inserts and returns employee invite", async () => {
      const invite = {
        id: "inv-1",
        company_id: "comp-1",
        email: "test@example.com",
      };
      const builder = createMockQueryBuilder({ data: invite });
      const supabase = createMockSupabase({ employee_invites: builder });

      const { EmployeeRepository } = await import("@/lib/repositories/EmployeeRepository");
      const result = await EmployeeRepository.createInvite(supabase, {
        companyId: "comp-1",
        email: "test@example.com",
        fullName: "Test User",
        invitedBy: "admin-1",
      });

      expect(result).toEqual(invite);
      expect(builder.insert).toHaveBeenCalledWith({
        company_id: "comp-1",
        email: "test@example.com",
        full_name: "Test User",
        invited_by: "admin-1",
      });
    });

    it("uses null for optional fields when omitted", async () => {
      const invite = { id: "inv-2" };
      const builder = createMockQueryBuilder({ data: invite });
      const supabase = createMockSupabase({ employee_invites: builder });

      const { EmployeeRepository } = await import("@/lib/repositories/EmployeeRepository");
      await EmployeeRepository.createInvite(supabase, {
        companyId: "comp-1",
        email: "test@example.com",
      });

      expect(builder.insert).toHaveBeenCalledWith({
        company_id: "comp-1",
        email: "test@example.com",
        full_name: null,
        invited_by: null,
      });
    });

    it("throws on insert error", async () => {
      const builder = createMockQueryBuilder({
        error: { message: "insert failed" },
      });
      const supabase = createMockSupabase({ employee_invites: builder });

      const { EmployeeRepository } = await import("@/lib/repositories/EmployeeRepository");
      await expect(
        EmployeeRepository.createInvite(supabase, {
          companyId: "comp-1",
          email: "test@example.com",
        }),
      ).rejects.toBeDefined();
    });
  });

  describe("getInviteByToken", () => {
    it("returns invite when token is valid and not accepted/expired", async () => {
      const invite = { id: "inv-1", invite_token: "tok-123" };
      const builder = createMockQueryBuilder({ data: invite });
      const supabase = createMockSupabase({ employee_invites: builder });

      const { EmployeeRepository } = await import("@/lib/repositories/EmployeeRepository");
      const result = await EmployeeRepository.getInviteByToken(supabase, "tok-123");

      expect(result).toEqual(invite);
      expect(builder.eq).toHaveBeenCalledWith("invite_token", "tok-123");
      expect(builder.is).toHaveBeenCalledWith("accepted_at", null);
      expect(builder.gt).toHaveBeenCalledWith("expires_at", expect.any(String));
    });

    it("returns null when no matching invite found", async () => {
      const builder = createMockQueryBuilder({ data: null });
      const supabase = createMockSupabase({ employee_invites: builder });

      const { EmployeeRepository } = await import("@/lib/repositories/EmployeeRepository");
      const result = await EmployeeRepository.getInviteByToken(supabase, "bad-token");

      expect(result).toBeNull();
    });
  });

  describe("acceptInvite", () => {
    it("updates accepted_at timestamp", async () => {
      const builder = createMockQueryBuilder();
      const supabase = createMockSupabase({ employee_invites: builder });

      const { EmployeeRepository } = await import("@/lib/repositories/EmployeeRepository");
      await EmployeeRepository.acceptInvite(supabase, "inv-1");

      expect(builder.update).toHaveBeenCalledWith({
        accepted_at: expect.any(String),
      });
      expect(builder.eq).toHaveBeenCalledWith("id", "inv-1");
    });
  });

  describe("createReferral", () => {
    it("inserts and returns referral", async () => {
      const referral = { id: "ref-1", referrer_id: "u1", job_id: "j1" };
      const builder = createMockQueryBuilder({ data: referral });
      const supabase = createMockSupabase({ employee_referrals: builder });

      const { EmployeeRepository } = await import("@/lib/repositories/EmployeeRepository");
      const result = await EmployeeRepository.createReferral(supabase, {
        referrerId: "u1",
        referrerCompanyId: "comp-1",
        jobId: "j1",
        candidatePhone: "+919999999999",
        candidateName: "Alice",
      });

      expect(result).toEqual(referral);
      expect(builder.insert).toHaveBeenCalledWith({
        referrer_id: "u1",
        referrer_company_id: "comp-1",
        job_id: "j1",
        candidate_phone: "+919999999999",
        candidate_name: "Alice",
      });
    });

    it("throws on insert error", async () => {
      const builder = createMockQueryBuilder({
        error: { message: "dup" },
      });
      const supabase = createMockSupabase({ employee_referrals: builder });

      const { EmployeeRepository } = await import("@/lib/repositories/EmployeeRepository");
      await expect(
        EmployeeRepository.createReferral(supabase, {
          referrerId: "u1",
          referrerCompanyId: "comp-1",
          jobId: "j1",
          candidatePhone: "+910000000000",
          candidateName: "Bob",
        }),
      ).rejects.toBeDefined();
    });
  });

  describe("getReferralsByReferrer", () => {
    it("returns referrals with joined job info", async () => {
      const referrals = [{ id: "ref-1", referrer_id: "u1", jobs: { id: "j1", title: "Eng" } }];
      const builder = createMockQueryBuilder({ data: referrals });
      const supabase = createMockSupabase({ employee_referrals: builder });

      const { EmployeeRepository } = await import("@/lib/repositories/EmployeeRepository");
      const result = await EmployeeRepository.getReferralsByReferrer(supabase, "u1");

      expect(result).toEqual(referrals);
      expect(builder.select).toHaveBeenCalledWith("*, jobs(id, title)");
      expect(builder.eq).toHaveBeenCalledWith("referrer_id", "u1");
      expect(builder.order).toHaveBeenCalledWith("created_at", {
        ascending: false,
      });
    });

    it("returns empty array when data is null", async () => {
      const builder = createMockQueryBuilder({ data: null });
      const supabase = createMockSupabase({ employee_referrals: builder });

      const { EmployeeRepository } = await import("@/lib/repositories/EmployeeRepository");
      const result = await EmployeeRepository.getReferralsByReferrer(supabase, "u1");

      expect(result).toEqual([]);
    });

    it("throws on error", async () => {
      const builder = createMockQueryBuilder({
        error: { message: "query error" },
      });
      const supabase = createMockSupabase({ employee_referrals: builder });

      const { EmployeeRepository } = await import("@/lib/repositories/EmployeeRepository");
      await expect(EmployeeRepository.getReferralsByReferrer(supabase, "u1")).rejects.toBeDefined();
    });
  });

  describe("getReferralsByCompany", () => {
    it("returns referrals with job and profile info", async () => {
      const referrals = [
        {
          id: "ref-1",
          referrer_company_id: "comp-1",
          jobs: { id: "j1", title: "Eng" },
          profiles: { full_name: "Alice" },
        },
      ];
      const builder = createMockQueryBuilder({ data: referrals });
      const supabase = createMockSupabase({ employee_referrals: builder });

      const { EmployeeRepository } = await import("@/lib/repositories/EmployeeRepository");
      const result = await EmployeeRepository.getReferralsByCompany(supabase, "comp-1");

      expect(result).toEqual(referrals);
      expect(builder.eq).toHaveBeenCalledWith("referrer_company_id", "comp-1");
    });

    it("returns empty array when data is null", async () => {
      const builder = createMockQueryBuilder({ data: null });
      const supabase = createMockSupabase({ employee_referrals: builder });

      const { EmployeeRepository } = await import("@/lib/repositories/EmployeeRepository");
      const result = await EmployeeRepository.getReferralsByCompany(supabase, "comp-1");

      expect(result).toEqual([]);
    });

    it("throws on error", async () => {
      const builder = createMockQueryBuilder({
        error: { message: "query error" },
      });
      const supabase = createMockSupabase({ employee_referrals: builder });

      const { EmployeeRepository } = await import("@/lib/repositories/EmployeeRepository");
      await expect(
        EmployeeRepository.getReferralsByCompany(supabase, "comp-1"),
      ).rejects.toBeDefined();
    });
  });

  describe("createResignation", () => {
    it("creates resignation event and updates candidate status", async () => {
      const resignation = { id: "res-1", candidate_id: "c1" };
      const resignationBuilder = createMockQueryBuilder({
        data: resignation,
      });
      const candidateBuilder = createMockQueryBuilder();

      const supabase = createMockSupabase({
        resignation_events: resignationBuilder,
        candidates: candidateBuilder,
      });

      const { EmployeeRepository } = await import("@/lib/repositories/EmployeeRepository");
      const result = await EmployeeRepository.createResignation(supabase, {
        candidateId: "c1",
        declaredBy: "self",
        declaredByUserId: "u1",
      });

      expect(result).toEqual(resignation);
      expect(resignationBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          candidate_id: "c1",
          declared_by: "self",
          declared_by_user_id: "u1",
        }),
      );
      expect(candidateBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({ employment_status: "resigned" }),
      );
    });

    it("uses null for optional declaredByUserId", async () => {
      const resignationBuilder = createMockQueryBuilder({
        data: { id: "res-2" },
      });
      const candidateBuilder = createMockQueryBuilder();

      const supabase = createMockSupabase({
        resignation_events: resignationBuilder,
        candidates: candidateBuilder,
      });

      const { EmployeeRepository } = await import("@/lib/repositories/EmployeeRepository");
      await EmployeeRepository.createResignation(supabase, {
        candidateId: "c1",
        declaredBy: "admin",
      });

      expect(resignationBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({ declared_by_user_id: null }),
      );
    });

    it("throws when resignation insert fails", async () => {
      const resignationBuilder = createMockQueryBuilder({
        error: { message: "insert failed" },
      });
      const supabase = createMockSupabase({
        resignation_events: resignationBuilder,
      });

      const { EmployeeRepository } = await import("@/lib/repositories/EmployeeRepository");
      await expect(
        EmployeeRepository.createResignation(supabase, {
          candidateId: "c1",
          declaredBy: "self",
        }),
      ).rejects.toBeDefined();
    });
  });

  describe("disputeResignation", () => {
    it("marks resignation as disputed with reason", async () => {
      const builder = createMockQueryBuilder();
      const supabase = createMockSupabase({ resignation_events: builder });

      const { EmployeeRepository } = await import("@/lib/repositories/EmployeeRepository");
      await EmployeeRepository.disputeResignation(
        supabase,
        "res-1",
        "admin-1",
        "Employee did not resign",
      );

      expect(builder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          disputed: true,
          disputed_by: "admin-1",
          dispute_reason: "Employee did not resign",
        }),
      );
      expect(builder.eq).toHaveBeenCalledWith("id", "res-1");
    });

    it("throws on update error", async () => {
      const builder = createMockQueryBuilder({
        error: { message: "update failed" },
      });
      const supabase = createMockSupabase({ resignation_events: builder });

      const { EmployeeRepository } = await import("@/lib/repositories/EmployeeRepository");
      await expect(
        EmployeeRepository.disputeResignation(supabase, "res-1", "admin-1", "Reason"),
      ).rejects.toBeDefined();
    });
  });
});

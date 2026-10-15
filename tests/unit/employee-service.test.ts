import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, createMockQueryBuilder } from "../helpers";

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/whatsapp/referral-handler", () => ({
  reachReferredCandidateOnWhatsApp: vi
    .fn()
    .mockResolvedValue({ reached: true, via: "utility_th_application_received" }),
}));

vi.mock("@/lib/feature-flags", () => ({
  isEnabled: vi.fn().mockResolvedValue(false),
}));

describe("EmployeeService", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("getOpenPositions", () => {
    it("delegates to JobRepository.getActiveByCompany", async () => {
      const jobs = [
        { id: "j1", title: "Engineer", status: "open" },
        { id: "j2", title: "Designer", status: "open" },
      ];
      const jobsBuilder = createMockQueryBuilder({ data: jobs });
      const supabase = createMockSupabase({ jobs: jobsBuilder });

      const { EmployeeService } = await import("@/lib/services/EmployeeService");
      const result = await EmployeeService.getOpenPositions(supabase, "company-1");

      expect(result).toEqual(jobs);
    });

    it("returns empty array when no jobs", async () => {
      const jobsBuilder = createMockQueryBuilder({ data: [] });
      const supabase = createMockSupabase({ jobs: jobsBuilder });

      const { EmployeeService } = await import("@/lib/services/EmployeeService");
      const result = await EmployeeService.getOpenPositions(supabase, "company-1");

      expect(result).toEqual([]);
    });

    it("throws when JobRepository throws", async () => {
      const jobsBuilder = createMockQueryBuilder({
        error: { message: "db error" },
      });
      const supabase = createMockSupabase({ jobs: jobsBuilder });

      const { EmployeeService } = await import("@/lib/services/EmployeeService");
      await expect(EmployeeService.getOpenPositions(supabase, "company-1")).rejects.toBeDefined();
    });
  });

  describe("refer", () => {
    it("creates referral, fetches referrer name, sends invite, and logs", async () => {
      const referral = { id: "ref-1", referrer_id: "u1", job_id: "j1" };
      const referralBuilder = createMockQueryBuilder({ data: referral });
      const profileBuilder = createMockQueryBuilder({
        data: { full_name: "Alice" },
      });
      const supabase = createMockSupabase({
        employee_referrals: referralBuilder,
        profiles: profileBuilder,
      });

      const { EmployeeService } = await import("@/lib/services/EmployeeService");
      const { reachReferredCandidateOnWhatsApp } = await import("@/lib/whatsapp/referral-handler");
      const { logger } = await import("@/lib/observability/logger");

      const result = await EmployeeService.refer(supabase, "u1", "comp-1", {
        jobId: "j1",
        candidatePhone: "9876543210",
        candidateName: "Bob",
      });

      expect(result.referral).toEqual(referral);
      expect(result.whatsapp.reached).toBe(true);
      expect(result.whatsapp.status).toBe("accepted");
      expect(result.whatsapp.channel).toBe("utility_th_application_received");
      expect(reachReferredCandidateOnWhatsApp).toHaveBeenCalledWith(
        expect.objectContaining({
          candidatePhone: "919876543210",
          candidateName: "Bob",
          referrerName: "Alice",
        }),
      );
      expect(logger.info).toHaveBeenCalledWith(
        "Employee referral created",
        expect.objectContaining({ user_id: "u1", job_id: "j1" }),
      );
    });

    it("uses fallback name when referrer profile has no full_name", async () => {
      const referral = { id: "ref-2" };
      const referralBuilder = createMockQueryBuilder({ data: referral });
      const profileBuilder = createMockQueryBuilder({
        data: { full_name: null },
      });
      const supabase = createMockSupabase({
        employee_referrals: referralBuilder,
        profiles: profileBuilder,
      });

      const { EmployeeService } = await import("@/lib/services/EmployeeService");
      const { reachReferredCandidateOnWhatsApp } = await import("@/lib/whatsapp/referral-handler");

      await EmployeeService.refer(supabase, "u1", "comp-1", {
        jobId: "j1",
        candidatePhone: "9123456789",
        candidateName: "Carol",
      });

      expect(reachReferredCandidateOnWhatsApp).toHaveBeenCalledWith(
        expect.objectContaining({ referrerName: "A colleague" }),
      );
    });

    it("uses fallback name when referrer profile query returns null data", async () => {
      const referral = { id: "ref-3" };
      const referralBuilder = createMockQueryBuilder({ data: referral });
      const profileBuilder = createMockQueryBuilder({ data: null });
      const supabase = createMockSupabase({
        employee_referrals: referralBuilder,
        profiles: profileBuilder,
      });

      const { EmployeeService } = await import("@/lib/services/EmployeeService");
      const { reachReferredCandidateOnWhatsApp } = await import("@/lib/whatsapp/referral-handler");

      await EmployeeService.refer(supabase, "u1", "comp-1", {
        jobId: "j1",
        candidatePhone: "9234567890",
        candidateName: "Dan",
      });

      expect(reachReferredCandidateOnWhatsApp).toHaveBeenCalledWith(
        expect.objectContaining({ referrerName: "A colleague" }),
      );
    });

    it("returns failed status when WhatsApp outreach does not reach", async () => {
      const referral = { id: "ref-fail" };
      const referralBuilder = createMockQueryBuilder({ data: referral });
      const profileBuilder = createMockQueryBuilder({
        data: { full_name: "Alice" },
      });
      const supabase = createMockSupabase({
        employee_referrals: referralBuilder,
        profiles: profileBuilder,
      });

      const { reachReferredCandidateOnWhatsApp } = await import("@/lib/whatsapp/referral-handler");
      vi.mocked(reachReferredCandidateOnWhatsApp).mockResolvedValueOnce({
        reached: false,
        error: "utility_first_contact_failed",
      });

      const { EmployeeService } = await import("@/lib/services/EmployeeService");
      const result = await EmployeeService.refer(supabase, "u1", "comp-1", {
        jobId: "j1",
        candidatePhone: "9876543210",
        candidateName: "Bob",
      });

      expect(result.whatsapp.reached).toBe(false);
      expect(result.whatsapp.status).toBe("failed");
      expect(result.whatsapp.channel).toBeNull();
    });

    it("throws when createReferral fails", async () => {
      const referralBuilder = createMockQueryBuilder({
        error: { message: "insert failed" },
      });
      const supabase = createMockSupabase({
        employee_referrals: referralBuilder,
      });

      const { EmployeeService } = await import("@/lib/services/EmployeeService");
      await expect(
        EmployeeService.refer(supabase, "u1", "comp-1", {
          jobId: "j1",
          candidatePhone: "9000000000",
          candidateName: "Eve",
        }),
      ).rejects.toBeDefined();
    });
  });

  describe("getMyReferrals", () => {
    it("returns referrals for the given referrer", async () => {
      const referrals = [
        { id: "ref-1", referrer_id: "u1" },
        { id: "ref-2", referrer_id: "u1" },
      ];
      const builder = createMockQueryBuilder({ data: referrals });
      const supabase = createMockSupabase({ employee_referrals: builder });

      const { EmployeeService } = await import("@/lib/services/EmployeeService");
      const result = await EmployeeService.getMyReferrals(supabase, "u1");

      expect(result).toEqual(referrals);
    });

    it("returns empty array when no referrals exist", async () => {
      const builder = createMockQueryBuilder({ data: [] });
      const supabase = createMockSupabase({ employee_referrals: builder });

      const { EmployeeService } = await import("@/lib/services/EmployeeService");
      const result = await EmployeeService.getMyReferrals(supabase, "u1");

      expect(result).toEqual([]);
    });
  });

  describe("declareResignation", () => {
    it("creates resignation event and logs it", async () => {
      const resignation = { id: "res-1", candidate_id: "c1" };
      const resignationBuilder = createMockQueryBuilder({
        data: resignation,
      });
      const candidateBuilder = createMockQueryBuilder();
      const supabase = createMockSupabase({
        resignation_events: resignationBuilder,
        candidates: candidateBuilder,
      });

      const { EmployeeService } = await import("@/lib/services/EmployeeService");
      const { logger } = await import("@/lib/observability/logger");

      const result = await EmployeeService.declareResignation(supabase, "c1", "u1");

      expect(result).toEqual(resignation);
      expect(logger.info).toHaveBeenCalledWith(
        "Resignation declared",
        expect.objectContaining({ candidate_id: "c1", user_id: "u1" }),
      );
    });

    it("throws when createResignation fails", async () => {
      const resignationBuilder = createMockQueryBuilder({
        error: { message: "insert failed" },
      });
      const supabase = createMockSupabase({
        resignation_events: resignationBuilder,
      });

      const { EmployeeService } = await import("@/lib/services/EmployeeService");
      await expect(EmployeeService.declareResignation(supabase, "c1", "u1")).rejects.toBeDefined();
    });
  });

  describe("disputeResignation", () => {
    it("disputes resignation and logs it", async () => {
      const builder = createMockQueryBuilder();
      const supabase = createMockSupabase({ resignation_events: builder });

      const { EmployeeService } = await import("@/lib/services/EmployeeService");
      const { logger } = await import("@/lib/observability/logger");

      await EmployeeService.disputeResignation(supabase, "res-1", "admin-1", "Not valid");

      expect(builder.update).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        "Resignation disputed",
        expect.objectContaining({ user_id: "admin-1" }),
      );
    });

    it("throws when disputeResignation fails", async () => {
      const builder = createMockQueryBuilder({
        error: { message: "update failed" },
      });
      const supabase = createMockSupabase({ resignation_events: builder });

      const { EmployeeService } = await import("@/lib/services/EmployeeService");
      await expect(
        EmployeeService.disputeResignation(supabase, "res-1", "admin-1", "Reason"),
      ).rejects.toBeDefined();
    });
  });
});

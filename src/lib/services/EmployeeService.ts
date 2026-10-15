import type { SupabaseClient } from "@supabase/supabase-js";
import { EmployeeRepository } from "@/lib/repositories/EmployeeRepository";
import { JobRepository } from "@/lib/repositories/JobRepository";
import { SessionRepository } from "@/lib/repositories/SessionRepository";
import { filterReferrableOpenJobs } from "@/lib/jobs/filter-referrable-open-jobs";
import { isEnabled } from "@/lib/feature-flags";
import { reachReferredCandidateOnWhatsApp } from "@/lib/whatsapp/referral-handler";
import {
  isValidCanonicalIndianWhatsAppPhone,
  normalizeIndianPhone,
} from "@/lib/whatsapp/normalize-phone";
import { logger } from "@/lib/observability/logger";

const REFERRAL_CONSENT_FLAG = "whatsapp_referral_consent_v2";

export const EmployeeService = {
  async getOpenPositions(supabase: SupabaseClient, companyId: string) {
    const jobs = await JobRepository.getActiveByCompany(supabase, companyId);
    return filterReferrableOpenJobs(jobs);
  },

  async refer(
    supabase: SupabaseClient,
    referrerId: string,
    referrerCompanyId: string,
    payload: { jobId: string; candidatePhone: string; candidateName: string },
    options?: { directReferrerId?: string | null },
  ) {
    const candidatePhone = normalizeIndianPhone(payload.candidatePhone.trim());
    if (!isValidCanonicalIndianWhatsAppPhone(candidatePhone)) {
      throw new Error(
        "Enter a valid Indian WhatsApp number (10 digits, or +91 followed by 10 digits).",
      );
    }

    const referral = await EmployeeRepository.createReferral(supabase, {
      referrerId,
      referrerCompanyId,
      jobId: payload.jobId,
      candidatePhone,
      candidateName: payload.candidateName,
    });

    const { data: referrer } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", referrerId)
      .single();

    const referrerName = referrer?.full_name ?? "A colleague";

    const candidateContext: Record<string, unknown> = {
      referred_by: referrerId,
      referrer_name: referrerName,
      employee_referral_id: referral.id,
      job_id: payload.jobId,
    };
    const directReferrerId = options?.directReferrerId?.trim();
    if (directReferrerId) {
      candidateContext.direct_referrer_id = directReferrerId;
      candidateContext.referrer_referrers_id = directReferrerId;
    }

    await SessionRepository.mergeReferralContext(supabase, candidatePhone, candidateContext);

    const useReferralConsentFlow = await isEnabled(REFERRAL_CONSENT_FLAG, referrerCompanyId);
    const reach = await reachReferredCandidateOnWhatsApp({
      supabase,
      candidatePhone,
      candidateName: payload.candidateName,
      referrerName,
      useReferralConsentFlow,
      candidateContext,
    });

    if (!reach.reached) {
      logger.warn("Employee referral: WhatsApp outreach did not confirm delivery", {
        user_id: referrerId,
        job_id: payload.jobId,
        error: reach.error,
        via: reach.via,
      });
    }

    logger.info("Employee referral created", {
      user_id: referrerId,
      job_id: payload.jobId,
      message: candidatePhone,
      whatsapp_reached: reach.reached,
      whatsapp_via: reach.via,
      has_direct_referrer: Boolean(directReferrerId),
    });

    return {
      referral,
      whatsapp: {
        reached: reach.reached,
        status: reach.reached ? ("accepted" as const) : ("failed" as const),
        channel: reach.via ?? null,
        via: reach.via ?? null,
        error: reach.error ?? null,
      },
    };
  },

  async getMyReferrals(supabase: SupabaseClient, referrerId: string) {
    return EmployeeRepository.getReferralsByReferrer(supabase, referrerId);
  },

  async declareResignation(supabase: SupabaseClient, candidateId: string, userId: string) {
    const resignation = await EmployeeRepository.createResignation(supabase, {
      candidateId,
      declaredBy: "self",
      declaredByUserId: userId,
    });
    logger.info("Resignation declared", {
      candidate_id: candidateId,
      user_id: userId,
    });
    return resignation;
  },

  async disputeResignation(
    supabase: SupabaseClient,
    resignationId: string,
    adminId: string,
    reason: string,
  ) {
    await EmployeeRepository.disputeResignation(supabase, resignationId, adminId, reason);
    logger.info("Resignation disputed", { user_id: adminId });
  },
};

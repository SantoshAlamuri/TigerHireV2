import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteCachedAuthProfile } from "@/lib/redis/auth-profile-cache";
import { logger } from "@/lib/observability/logger";

const EMPLOYEE_INVITE_COLUMNS =
  "id, company_id, email, full_name, invited_by, invite_token, accepted_at, expires_at, created_at, updated_at";
const EMPLOYEE_REFERRAL_COLUMNS =
  "id, referrer_id, referrer_company_id, job_id, candidate_phone, candidate_name, created_at, updated_at";
const RESIGNATION_EVENT_COLUMNS =
  "id, candidate_id, declared_by, declared_by_user_id, profile_unlock_scheduled_at, disputed, disputed_by, disputed_at, dispute_reason, created_at, updated_at";

export const EmployeeRepository = {
  /**
   * Converts a candidate to an active employee of the hiring company.
   * Updates both `candidates` (employment status) and `profiles` (role + org).
   * Invalidates the auth cache so the next request picks up the new role.
   */
  async onboardAsEmployee(
    supabase: SupabaseClient,
    payload: {
      candidateId: string;
      companyId: string;
    },
  ) {
    const { candidateId, companyId } = payload;

    const { error: candErr } = await supabase
      .from("candidates")
      .update({
        employment_status: "active_employee",
        employer_company_id: companyId,
      })
      .eq("id", candidateId);

    if (candErr) {
      logger.error("Failed to update candidate employment status", {
        candidateId,
        error: String(candErr),
      });
      throw candErr;
    }

    const { data: candidate } = await supabase
      .from("candidates")
      .select("user_id")
      .eq("id", candidateId)
      .single();

    if (candidate?.user_id) {
      const { error: profErr } = await supabase
        .from("profiles")
        .update({
          role: "employee",
          organisation_id: companyId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", candidate.user_id);

      if (profErr) {
        logger.error("Failed to update profile to employee role", {
          userId: candidate.user_id,
          error: String(profErr),
        });
        throw profErr;
      }

      await deleteCachedAuthProfile(candidate.user_id);

      logger.info("Candidate onboarded as employee", {
        candidateId,
        userId: candidate.user_id,
        companyId,
      });
    } else {
      logger.info("Candidate onboarded as employee (unclaimed profile)", {
        candidateId,
        companyId,
      });
    }

    return { candidateId, companyId, userId: candidate?.user_id ?? null };
  },

  async createInvite(
    supabase: SupabaseClient,
    payload: {
      companyId: string;
      email: string;
      fullName?: string;
      invitedBy?: string;
    },
  ) {
    const { data, error } = await supabase
      .from("employee_invites")
      .insert({
        company_id: payload.companyId,
        email: payload.email,
        full_name: payload.fullName ?? null,
        invited_by: payload.invitedBy ?? null,
      })
      .select(EMPLOYEE_INVITE_COLUMNS)
      .single();
    if (error) throw error;
    return data;
  },

  async getInviteByToken(supabase: SupabaseClient, token: string) {
    const { data } = await supabase
      .from("employee_invites")
      .select(EMPLOYEE_INVITE_COLUMNS)
      .eq("invite_token", token)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();
    return data;
  },

  async acceptInvite(supabase: SupabaseClient, id: string) {
    await supabase
      .from("employee_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", id);
  },

  async createReferral(
    supabase: SupabaseClient,
    payload: {
      referrerId: string;
      referrerCompanyId: string;
      jobId: string;
      candidatePhone: string;
      candidateName: string;
    },
  ) {
    const { data, error } = await supabase
      .from("employee_referrals")
      .insert({
        referrer_id: payload.referrerId,
        referrer_company_id: payload.referrerCompanyId,
        job_id: payload.jobId,
        candidate_phone: payload.candidatePhone,
        candidate_name: payload.candidateName,
      })
      .select(EMPLOYEE_REFERRAL_COLUMNS)
      .single();
    if (error) throw error;
    return data;
  },

  async getReferralsByReferrer(supabase: SupabaseClient, referrerId: string) {
    const { data, error } = await supabase
      .from("employee_referrals")
      .select("*, jobs(id, title)")
      .eq("referrer_id", referrerId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async getReferralsByCompany(supabase: SupabaseClient, companyId: string) {
    const { data, error } = await supabase
      .from("employee_referrals")
      .select("*, jobs(id, title), profiles!employee_referrals_referrer_id_fkey(full_name)")
      .eq("referrer_company_id", companyId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async createResignation(
    supabase: SupabaseClient,
    payload: {
      candidateId: string;
      declaredBy: "self" | "admin";
      declaredByUserId?: string;
    },
  ) {
    const unlockTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const { data, error } = await supabase
      .from("resignation_events")
      .insert({
        candidate_id: payload.candidateId,
        declared_by: payload.declaredBy,
        declared_by_user_id: payload.declaredByUserId ?? null,
        profile_unlock_scheduled_at: unlockTime.toISOString(),
      })
      .select(RESIGNATION_EVENT_COLUMNS)
      .single();
    if (error) throw error;

    await supabase
      .from("candidates")
      .update({
        employment_status: "resigned",
        resignation_declared_at: new Date().toISOString(),
      })
      .eq("id", payload.candidateId);

    return data;
  },

  async disputeResignation(
    supabase: SupabaseClient,
    resignationId: string,
    disputedBy: string,
    reason: string,
  ) {
    const { error } = await supabase
      .from("resignation_events")
      .update({
        disputed: true,
        disputed_by: disputedBy,
        disputed_at: new Date().toISOString(),
        dispute_reason: reason,
      })
      .eq("id", resignationId);
    if (error) throw error;
  },
};

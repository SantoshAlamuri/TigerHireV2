import type { SupabaseClient } from "@supabase/supabase-js";
import { syncEmployeeReferralFromApplication } from "@/lib/referrals/sync-employee-referral-from-application";

/**
 * When an application reaches a referral milestone, sync `employee_referrals` and ensure
 * `applications.direct_referrer_id` is set for WhatsApp-originated invites.
 */
export async function bridgeEmployeeReferralAttribution(
  supabase: SupabaseClient,
  candidateId: string,
  jobId: string,
  milestoneStatus: string,
): Promise<{ bridged: boolean; referrerId?: string }> {
  const result = await syncEmployeeReferralFromApplication(
    supabase,
    candidateId,
    jobId,
    milestoneStatus,
  );
  return {
    bridged: result.synced,
    referrerId: result.referrerId,
  };
}

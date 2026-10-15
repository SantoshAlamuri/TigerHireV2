import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhoneDigits } from "@/lib/referrals/normalize-phone-digits";
import { resolveReferrerIdForUser } from "@/lib/referrers/resolve-referrer-id";
import { logger } from "@/lib/observability/logger";

/** Maps `applications.status` → `employee_referrals.status` (schema in 31_employee_referrals.sql). */
export function applicationStatusToEmployeeReferralStatus(
  applicationStatus: string,
): string | null {
  const s = applicationStatus.trim().toLowerCase();
  if (s === "rejected" || s === "withdrawn") return "rejected";
  if (s === "hired" || s === "offer_accepted") return "hired";
  if (s === "shortlisted") return "shortlisted";
  if (s === "viewed") return "scored";
  if (s === "applied") return "cv_received";
  return null;
}

const STATUS_RANK: Record<string, number> = {
  invited: 0,
  pending: 0,
  cv_received: 10,
  scored: 20,
  shortlisted: 30,
  interviewed: 40,
  hired: 50,
  rejected: 60,
};

function shouldApplyReferralStatus(current: string, next: string): boolean {
  if (next === "rejected") return true;
  const cur = STATUS_RANK[current] ?? -1;
  const nxt = STATUS_RANK[next] ?? -1;
  return nxt >= cur;
}

async function findEmployeeReferral(
  supabase: SupabaseClient,
  jobId: string,
  candidateId: string,
  phoneNorm: string | null,
) {
  const { data: byCandidate } = await supabase
    .from("employee_referrals")
    .select("id, referrer_id, candidate_phone, status, job_id, candidate_id")
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .maybeSingle();
  if (byCandidate) return byCandidate;

  if (!phoneNorm || phoneNorm.length < 10) return null;

  const { data: rows, error } = await supabase
    .from("employee_referrals")
    .select("id, referrer_id, candidate_phone, status, job_id, candidate_id")
    .eq("job_id", jobId);
  if (error || !rows?.length) return null;

  return (
    rows.find((r) => normalizePhoneDigits(String(r.candidate_phone ?? "")) === phoneNorm) ?? null
  );
}

/**
 * Keeps WhatsApp-originated `employee_referrals` in sync with the application pipeline so
 * tracking and payout attribution match link referrals.
 */
export async function syncEmployeeReferralFromApplication(
  supabase: SupabaseClient,
  candidateId: string,
  jobId: string,
  applicationStatus: string,
): Promise<{ synced: boolean; employeeReferralId?: string; referrerId?: string }> {
  const nextStatus = applicationStatusToEmployeeReferralStatus(applicationStatus);
  if (!nextStatus) return { synced: false };

  const { data: candidate, error: candErr } = await supabase
    .from("candidates")
    .select("phone")
    .eq("id", candidateId)
    .maybeSingle();
  if (candErr) return { synced: false };

  const phoneNorm = candidate?.phone ? normalizePhoneDigits(String(candidate.phone)) : null;

  const match = await findEmployeeReferral(supabase, jobId, candidateId, phoneNorm);
  if (!match) return { synced: false };

  const currentStatus = String(match.status ?? "invited");
  const updates: Record<string, unknown> = {
    candidate_id: candidateId,
    updated_at: new Date().toISOString(),
  };

  if (shouldApplyReferralStatus(currentStatus, nextStatus)) {
    updates.status = nextStatus;
    if (nextStatus === "hired") {
      updates.referral_bonus_eligible = true;
    }
  }

  await supabase.from("employee_referrals").update(updates).eq("id", match.id);

  const profileReferrerId = match.referrer_id as string;
  const directReferrerId = await resolveReferrerIdForUser(supabase, profileReferrerId);

  const { data: app } = await supabase
    .from("applications")
    .select("id, direct_referrer_id")
    .eq("candidate_id", candidateId)
    .eq("job_id", jobId)
    .maybeSingle();

  if (app && directReferrerId && !app.direct_referrer_id) {
    await supabase
      .from("applications")
      .update({
        direct_referrer_id: directReferrerId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", app.id);
    logger.info("employee_referral_sync: application linked to referrer", {
      application_id: app.id,
      direct_referrer_id: directReferrerId,
      employee_referral_id: match.id,
    });
  }

  return {
    synced: true,
    employeeReferralId: match.id as string,
    referrerId: directReferrerId ?? undefined,
  };
}

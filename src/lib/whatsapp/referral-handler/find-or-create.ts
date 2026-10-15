import { logger } from "@/lib/observability/logger";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/config/env";

/** Reuse a recent referral row for the same target phone instead of creating duplicates. */
export async function findOrCreateReferralForTarget(input: {
  referrerId: string;
  candidatePhone: string;
  roleCategory: string;
  location: string;
}): Promise<{ id: string; reused: boolean } | null> {
  const supabase = createSupabaseAdmin();
  const dedupWindowHours = env.referralTargetDedupWindowHours;
  if (dedupWindowHours > 0) {
    const windowStartIso = new Date(Date.now() - dedupWindowHours * 60 * 60 * 1000).toISOString();
    const { data: existing } = await supabase
      .from("referrals")
      .select("id")
      .eq("referrer_id", input.referrerId)
      .eq("target_phone", input.candidatePhone)
      .gte("created_at", windowStartIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      return { id: String(existing.id), reused: true };
    }
  }

  const { data: referral, error } = await supabase
    .from("referrals")
    .insert({
      referrer_id: input.referrerId,
      role_category: input.roleCategory,
      location: input.location,
      status: "pending",
      target_phone: input.candidatePhone,
    })
    .select("id")
    .single();

  if (error || !referral?.id) {
    logger.error("findOrCreateReferralForTarget: insert failed", { error: String(error) });
    return null;
  }
  return { id: String(referral.id), reused: false };
}

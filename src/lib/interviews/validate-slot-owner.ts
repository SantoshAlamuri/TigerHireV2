import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ensures the chosen slot owner belongs to the job's organisation (recruiters may create on behalf of interviewers).
 */
export async function assertSlotOwnerForJob(
  admin: SupabaseClient,
  organisationId: string,
  ownerUserId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, organisation_id, is_active")
    .eq("id", ownerUserId)
    .maybeSingle();

  if (error || !profile) {
    return { ok: false, message: "Slot owner not found" };
  }
  if (profile.organisation_id !== organisationId) {
    return { ok: false, message: "Slot owner must be in your organisation" };
  }
  if (profile.is_active === false) {
    return { ok: false, message: "Slot owner account is not active" };
  }
  return { ok: true };
}

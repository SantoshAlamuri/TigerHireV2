import type { SupabaseClient } from "@supabase/supabase-js";

/** Jobs in the organisation where the user is the assigned hiring manager. */
export async function listHiringManagerJobIds(
  supabase: SupabaseClient,
  organisationId: string,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("hiring_manager_id", userId);
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string).filter(Boolean);
}

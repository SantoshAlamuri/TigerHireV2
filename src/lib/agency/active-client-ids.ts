import type { SupabaseClient } from "@supabase/supabase-js";

/** Client org IDs linked to the agency (same rows as legacy inline `agency_clients` query). */
export async function selectActiveAgencyClientOrganisationIds(
  supabase: SupabaseClient,
  agencyOrganisationId: string,
): Promise<string[]> {
  const { data: links } = await supabase
    .from("agency_clients")
    .select("client_organisation_id")
    .eq("agency_organisation_id", agencyOrganisationId);
  return (links ?? []).map((r: { client_organisation_id: string }) => r.client_organisation_id);
}

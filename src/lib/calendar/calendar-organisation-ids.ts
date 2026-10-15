import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Organisation ids whose jobs/events appear on the org calendar.
 * Agency (and similar) users also see linked client organisations.
 */
export async function resolveCalendarOrganisationIds(
  supabase: SupabaseClient,
  organisationId: string,
  role: string,
): Promise<string[]> {
  const ids = new Set<string>([organisationId]);

  if (
    role === "agency" ||
    role === "leadership" ||
    role === "recruiter" ||
    role === "super_admin"
  ) {
    const { data: links } = await supabase
      .from("agency_clients")
      .select("client_organisation_id")
      .eq("agency_organisation_id", organisationId);
    for (const row of links ?? []) {
      const clientId = row.client_organisation_id as string | null;
      if (clientId) ids.add(clientId);
    }
  }

  return [...ids];
}

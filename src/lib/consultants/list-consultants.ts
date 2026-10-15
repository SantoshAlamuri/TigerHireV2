import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";

export interface ConsultantRow {
  linkId: string;
  agencyOrganisationId: string;
  name: string;
  isActive: boolean;
  linkedAt: string;
  /** 'pending' = the firm asked and the company has not decided yet. */
  status: string;
  /** Who started it: 'agency' (a request) or 'company' (an invite). */
  initiatedBy: string | null;
}

export interface ConsultantInviteRow {
  id: string;
  email: string;
  agencyName: string | null;
  status: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
}

/**
 * Firms linked to `companyOrganisationId`, with their names resolved.
 *
 * Takes the service-role client on purpose: `agency_clients` RLS is agency-side
 * only, so a company cannot read the rows that grant access to its own pipeline.
 * The caller's org id below is the tenant boundary.
 */
export async function listCompanyConsultants(
  admin: SupabaseClient,
  companyOrganisationId: string,
): Promise<ConsultantRow[] | null> {
  const { data: links, error } = await admin
    .from("agency_clients")
    .select("id, agency_organisation_id, is_active, created_at, status, initiated_by")
    .eq("client_organisation_id", companyOrganisationId);

  if (error) {
    logger.error("Failed to read agency_clients for company consultants", {
      error: error.message,
      organisationId: companyOrganisationId,
    });
    return null;
  }

  const agencyIds = (links ?? []).map((l) => l.agency_organisation_id).filter(Boolean);
  const names = new Map<string, string>();
  if (agencyIds.length > 0) {
    const { data: orgs } = await admin.from("organisations").select("id, name").in("id", agencyIds);
    for (const org of orgs ?? []) names.set(org.id, org.name);
  }

  return (links ?? []).map((l) => ({
    linkId: l.id,
    agencyOrganisationId: l.agency_organisation_id,
    name: names.get(l.agency_organisation_id) ?? "Unknown firm",
    isActive: l.is_active,
    linkedAt: l.created_at,
    status: l.status ?? "active",
    initiatedBy: l.initiated_by ?? null,
  }));
}

/** Invitations this company has sent, newest first. */
export async function listCompanyConsultantInvites(
  admin: SupabaseClient,
  companyOrganisationId: string,
): Promise<ConsultantInviteRow[]> {
  const { data: invites } = await admin
    .from("agency_client_invites")
    .select(
      "id, invited_email, invited_agency_name, status, created_at, expires_at, accepted_at, agency_organisation_id",
    )
    .eq("company_organisation_id", companyOrganisationId)
    .order("created_at", { ascending: false });

  return (invites ?? []).map((i) => ({
    id: i.id,
    email: i.invited_email,
    agencyName: i.invited_agency_name,
    status: i.status,
    createdAt: i.created_at,
    expiresAt: i.expires_at,
    acceptedAt: i.accepted_at,
  }));
}

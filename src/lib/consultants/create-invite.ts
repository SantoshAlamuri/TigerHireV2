import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import { CONSULTANT_INVITE_TTL_DAYS } from "@/lib/validations/consultant-invites";
import { sendConsultantInviteEmail } from "@/lib/consultants/invite-email";

export type CreateInviteResult =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      invite: { id: string; email: string; status: string; expiresAt: string };
      emailed: boolean;
    };

/**
 * Create a company -> consulting firm invitation and email it.
 *
 * The invite is only a proposal: the `agency_clients` link is created when the
 * firm accepts, so access always carries consent from both sides.
 */
export async function createConsultantInvite(params: {
  admin: SupabaseClient;
  companyOrganisationId: string;
  companyName: string;
  inviterUserId: string;
  inviterName: string;
  email: string;
  agencyName?: string;
  note?: string;
}): Promise<CreateInviteResult> {
  const { admin, companyOrganisationId, email } = params;

  // If the email already belongs to an agency user, resolve their firm now — so
  // the invite is bound to that firm and a duplicate link is caught before we
  // send anything.
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, role, organisation_id")
    .eq("email", email)
    .maybeSingle();

  const resolvedAgencyOrgId =
    existingProfile?.role === "agency" ? (existingProfile.organisation_id ?? null) : null;

  if (resolvedAgencyOrgId === companyOrganisationId) {
    return { ok: false, status: 400, error: "You cannot invite your own organisation" };
  }

  if (resolvedAgencyOrgId) {
    const { data: alreadyLinked } = await admin
      .from("agency_clients")
      .select("id")
      .eq("agency_organisation_id", resolvedAgencyOrgId)
      .eq("client_organisation_id", companyOrganisationId)
      .maybeSingle();
    if (alreadyLinked) {
      return { ok: false, status: 409, error: "This firm already has access to your roles" };
    }
  }

  const { data: pending } = await admin
    .from("agency_client_invites")
    .select("id")
    .eq("company_organisation_id", companyOrganisationId)
    .eq("invited_email", email)
    .eq("status", "pending")
    .maybeSingle();
  if (pending) {
    return { ok: false, status: 409, error: "An invite is already pending for this email" };
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + CONSULTANT_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const { data: invite, error: insertError } = await admin
    .from("agency_client_invites")
    .insert({
      company_organisation_id: companyOrganisationId,
      agency_organisation_id: resolvedAgencyOrgId,
      invited_email: email,
      invited_agency_name: params.agencyName ?? null,
      token,
      invited_by: params.inviterUserId,
      expires_at: expiresAt.toISOString(),
    })
    .select("id, invited_email, status, expires_at")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return { ok: false, status: 409, error: "An invite is already pending for this email" };
    }
    logger.error("Failed to create consultant invite", {
      error: insertError.message,
      code: insertError.code,
      organisationId: companyOrganisationId,
    });
    return { ok: false, status: 500, error: "Failed to create invite" };
  }

  let emailed = true;
  try {
    const result = await sendConsultantInviteEmail({
      email,
      companyName: params.companyName,
      inviterName: params.inviterName,
      note: params.note ?? null,
      token,
    });
    if (result && "error" in result && result.error) {
      emailed = false;
      logger.warn("Consultant invite email failed to send (invite still created)", {
        inviteId: invite.id,
        error: result.error.message,
      });
    }
  } catch (emailErr) {
    emailed = false;
    logger.warn("Consultant invite email threw (invite still created)", {
      inviteId: invite.id,
      error: String(emailErr),
    });
  }

  return {
    ok: true,
    invite: {
      id: invite.id,
      email: invite.invited_email,
      status: invite.status,
      expiresAt: invite.expires_at,
    },
    emailed,
  };
}

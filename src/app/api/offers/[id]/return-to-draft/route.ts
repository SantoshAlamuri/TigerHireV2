import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  ensureOrganisationAccess,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { hasAnyEnterpriseRole } from "@/lib/security/enterprise-roles";
import { validateOrigin } from "@/lib/security/csrf";
import { recordHiringOfferAuditEvent } from "@/lib/audit/hiring-offer-audit";
import { getRequestClientIp } from "@/lib/audit/client-ip";
import { getOrgSettingsPermissions, hasSettingsCapability } from "@/lib/settings/permissions";
import { forbidUnlessHiringManagerOwnsOfferJob } from "@/lib/security/hiring-manager-offer-access";
import { validateOfferTransition } from "@/lib/workflows/offer-state-machine";
import { z } from "zod";

const bodySchema = z.object({}).strict();

const OFFER_ALL_COLUMNS =
  "id, application_id, organisation_id, created_by, role_title, start_date, status, compensation_json, notes, sent_at, responded_at, expires_at, created_at, updated_at, public_token, public_token_otp, public_token_otp_expires_at, public_token_viewed_at, offer_pdf_template_id, offer_pdf_template_version_id, band_id, band_exception_reason, band_status, band_checked_at, signing_status, first_viewed_at, last_viewed_at, view_count, signed_at, declined_at, expired_at, signer_name, signer_ip, signer_user_agent, document_hash, document_content, signed_pdf_path, decline_reason, last_signing_reminder_at, letter_variables";

/**
 * POST /api/offers/[id]/return-to-draft
 * After a candidate counter (status `negotiating`), move the offer back to `draft` so it can be edited and re-approved.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const { id } = await params;
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    const bodyParsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!bodyParsed.success) return jsonError("Invalid request body", 400);

    const supabase = await createSupabaseServerClient();
    const allowed = await hasAnyEnterpriseRole(
      ctx.userId,
      ["leadership", "recruiter", "hiring_manager", "super_admin"],
      supabase,
    );
    if (!allowed) return jsonError("Forbidden", 403);

    if (!ctx.organisationId) return jsonError("No organisation context", 400);
    const rolePermissions = await getOrgSettingsPermissions(supabase, ctx.organisationId);
    const canEdit =
      ctx.role === "leadership" ||
      ctx.role === "super_admin" ||
      hasSettingsCapability(ctx.role, "create_offers", rolePermissions);
    if (!canEdit) {
      return jsonError(
        "Offer changes are disabled for your role. Ask a company admin to allow offer creation for your role.",
        403,
      );
    }

    const admin = createSupabaseAdmin();
    const { data: offer, error: offerError } = await admin
      .from("offers")
      .select("id, status, organisation_id, application_id, role_title")
      .eq("id", id)
      .single();
    if (offerError || !offer) return jsonError("Offer not found", 404);
    const orgAccessError = ensureOrganisationAccess(ctx, offer.organisation_id);
    if (orgAccessError) return orgAccessError;
    const hmErr = await forbidUnlessHiringManagerOwnsOfferJob({ ctx, admin, offerId: id });
    if (hmErr) return hmErr;

    if (offer.status !== "negotiating") {
      return jsonError("Only offers in negotiation can be opened for revision", 409);
    }

    const transition = validateOfferTransition({
      from: "negotiating",
      to: "draft",
      actorRole: ctx.role,
    });
    if (!transition.ok) return jsonError(transition.error, transition.status);

    const nowIso = new Date().toISOString();
    const { data: updated, error: updateError } = await admin
      .from("offers")
      .update({ status: "draft", updated_at: nowIso })
      .eq("id", id)
      .eq("status", "negotiating")
      .select(OFFER_ALL_COLUMNS)
      .maybeSingle();
    if (updateError || !updated) return jsonError("Failed to update offer", 500);

    await recordHiringOfferAuditEvent({
      organisationId: offer.organisation_id as string,
      entityType: "offer",
      entityId: id,
      eventType: "OFFER_RETURNED_TO_DRAFT",
      actorProfileId: ctx.userId,
      actorRole: ctx.role,
      prevStatus: "negotiating",
      newStatus: "draft",
      ipAddress: getRequestClientIp(request),
      metadata: { application_id: offer.application_id },
    });

    return jsonSuccess({ offer: updated });
  } catch (err) {
    return handleApiError(err, "Failed to open offer for revision", {
      route: "POST /api/offers/[id]/return-to-draft",
    });
  }
}

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
import { sendNativeOfferWithdrawnCandidateEmail } from "@/lib/offers/offer-native-notifications";
import { forbidUnlessHiringManagerOwnsOfferJob } from "@/lib/security/hiring-manager-offer-access";
import { z } from "zod";

const bodySchema = z.object({}).strict();

const OFFER_ALL_COLUMNS =
  "id, application_id, organisation_id, created_by, role_title, start_date, status, compensation_json, notes, sent_at, responded_at, expires_at, created_at, updated_at, public_token, public_token_otp, public_token_otp_expires_at, public_token_viewed_at, offer_pdf_template_id, offer_pdf_template_version_id, band_id, band_exception_reason, band_status, band_checked_at, signing_status, first_viewed_at, last_viewed_at, view_count, signed_at, declined_at, expired_at, signer_name, signer_ip, signer_user_agent, document_hash, document_content, signed_pdf_path, decline_reason, last_signing_reminder_at, letter_variables";

/**
 * POST /api/offers/[id]/cancel-and-regenerate
 * Cancel a sent offer (withdraw link) and immediately create a fresh draft with the same terms.
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

    const admin = createSupabaseAdmin();
    const { data: offer, error: offerError } = await admin
      .from("offers")
      .select(
        "id, application_id, organisation_id, role_title, start_date, status, signing_status, compensation_json, notes, offer_pdf_template_id, letter_variables, band_id, band_exception_reason, band_status, band_checked_at, applications(candidate_id)",
      )
      .eq("id", id)
      .single();
    if (offerError || !offer) return jsonError("Offer not found", 404);

    const orgAccessError = ensureOrganisationAccess(ctx, offer.organisation_id as string);
    if (orgAccessError) return orgAccessError;
    const hmErr = await forbidUnlessHiringManagerOwnsOfferJob({ ctx, admin, offerId: id });
    if (hmErr) return hmErr;

    if ((offer.status as string) !== "sent") {
      return jsonError("Only sent offers can be cancelled and regenerated", 409);
    }
    if ((offer.signing_status as string | null) === "signed") {
      return jsonError("Signed offers cannot be cancelled", 409);
    }

    const nowIso = new Date().toISOString();
    const { error: withdrawError } = await admin
      .from("offers")
      .update({
        status: "withdrawn",
        signing_status: "withdrawn",
        updated_at: nowIso,
      })
      .eq("id", id)
      .eq("status", "sent");
    if (withdrawError) return jsonError("Failed to cancel offer", 500);

    const { data: regenerated, error: regenerateError } = await admin
      .from("offers")
      .insert({
        application_id: offer.application_id as string,
        organisation_id: offer.organisation_id as string,
        created_by: ctx.userId,
        role_title: offer.role_title as string,
        start_date: offer.start_date as string,
        status: "draft",
        compensation_json: (offer.compensation_json as Record<string, unknown> | null) ?? {},
        notes: (offer.notes as string | null) ?? null,
        expires_at: null,
        offer_pdf_template_id: (offer.offer_pdf_template_id as string | null) ?? null,
        letter_variables: (offer.letter_variables as Record<string, unknown> | null) ?? {},
        band_id: (offer.band_id as string | null) ?? null,
        band_exception_reason: (offer.band_exception_reason as string | null) ?? null,
        band_status: (offer.band_status as string | null) ?? null,
        band_checked_at: (offer.band_checked_at as string | null) ?? null,
        signing_status: null,
      })
      .select(OFFER_ALL_COLUMNS)
      .single();
    if (regenerateError || !regenerated) {
      return jsonError("Failed to generate new draft", 500);
    }

    const apps = offer.applications as { candidate_id?: string } | null;
    const cid = apps?.candidate_id as string | undefined;
    if (cid) {
      const { data: cand } = await admin
        .from("candidates")
        .select("email, name, full_name")
        .eq("id", cid)
        .maybeSingle();
      const candidateEmail = ((cand?.email as string | null) ?? "").trim();
      const candidateDisplay =
        ((cand?.full_name as string | null) ?? "").trim() ||
        ((cand?.name as string | null) ?? "").trim() ||
        "Candidate";
      const { data: orgRow } = await admin
        .from("organisations")
        .select("name")
        .eq("id", offer.organisation_id as string)
        .maybeSingle();
      const companyName = (orgRow?.name as string | null) ?? "The company";
      if (candidateEmail) {
        await sendNativeOfferWithdrawnCandidateEmail({
          candidateEmail,
          candidateName: candidateDisplay,
          roleTitle: offer.role_title as string,
          companyName,
        });
      }
    }

    const requestIp = getRequestClientIp(request);
    await recordHiringOfferAuditEvent({
      organisationId: offer.organisation_id as string,
      entityType: "offer",
      entityId: id,
      eventType: "OFFER_RECALLED",
      actorProfileId: ctx.userId,
      actorRole: ctx.role,
      prevStatus: "sent",
      newStatus: "withdrawn",
      ipAddress: requestIp,
      metadata: {
        application_id: offer.application_id,
        replaced_by_offer_id: regenerated.id,
      },
    });
    await recordHiringOfferAuditEvent({
      organisationId: offer.organisation_id as string,
      entityType: "offer",
      entityId: regenerated.id as string,
      eventType: "OFFER_CREATED",
      actorProfileId: ctx.userId,
      actorRole: ctx.role,
      prevStatus: null,
      newStatus: "draft",
      ipAddress: requestIp,
      metadata: {
        application_id: offer.application_id,
        regenerated_from_offer_id: id,
      },
    });

    return jsonSuccess({ cancelledOfferId: id, offer: regenerated });
  } catch (err) {
    return handleApiError(err, "Failed to cancel and regenerate offer", {
      route: "POST /api/offers/[id]/cancel-and-regenerate",
    });
  }
}

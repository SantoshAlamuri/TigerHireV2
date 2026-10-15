import { NextRequest } from "next/server";
import { z } from "zod";
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

const recallOfferBodySchema = z.object({}).strict();

const OFFER_ALL_COLUMNS =
  "id, application_id, organisation_id, created_by, role_title, start_date, status, compensation_json, notes, sent_at, responded_at, expires_at, created_at, updated_at, public_token, public_token_otp, public_token_otp_expires_at, public_token_viewed_at, offer_pdf_template_id, offer_pdf_template_version_id, band_id, band_exception_reason, band_status, band_checked_at, signing_status, first_viewed_at, last_viewed_at, view_count, signed_at, declined_at, expired_at, signer_name, signer_ip, signer_user_agent, document_hash, document_content, signed_pdf_path, decline_reason, last_signing_reminder_at, letter_variables";

const offerIdParamsSchema = z.object({
  id: z.string().uuid(),
});

/**
 * POST /api/offers/[id]/recall
 * Withdraw a sent offer before acceptance. Candidate link stops working.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const paramsParsed = offerIdParamsSchema.safeParse(await params);
    if (!paramsParsed.success) return jsonError("Invalid offer id", 400);
    const { id } = paramsParsed.data;
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    const body = await request.json().catch(() => ({}));
    const bodyParsed = recallOfferBodySchema.safeParse(body);
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
      .select("id, status, organisation_id, application_id, role_title, applications(candidate_id)")
      .eq("id", id)
      .single();
    if (offerError || !offer) return jsonError("Offer not found", 404);
    const orgAccessError = ensureOrganisationAccess(ctx, offer.organisation_id);
    if (orgAccessError) return orgAccessError;
    const hmErr = await forbidUnlessHiringManagerOwnsOfferJob({ ctx, admin, offerId: id });
    if (hmErr) return hmErr;
    if (offer.status !== "sent") {
      return jsonError("Only sent offers can be withdrawn", 409);
    }

    const nowIso = new Date().toISOString();
    const { data: updated, error: updateError } = await admin
      .from("offers")
      .update({
        status: "withdrawn",
        signing_status: "withdrawn",
        updated_at: nowIso,
      })
      .eq("id", id)
      .eq("status", "sent")
      .select(OFFER_ALL_COLUMNS)
      .maybeSingle();
    if (updateError || !updated) return jsonError("Failed to withdraw offer", 500);

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

    await recordHiringOfferAuditEvent({
      organisationId: offer.organisation_id as string,
      entityType: "offer",
      entityId: id,
      eventType: "OFFER_RECALLED",
      actorProfileId: ctx.userId,
      actorRole: ctx.role,
      prevStatus: "sent",
      newStatus: "withdrawn",
      ipAddress: getRequestClientIp(request),
      metadata: { application_id: offer.application_id },
    });

    return jsonSuccess({ offer: updated });
  } catch (err) {
    return handleApiError(err, "Failed to withdraw offer", {
      route: "POST /api/offers/[id]/recall",
    });
  }
}

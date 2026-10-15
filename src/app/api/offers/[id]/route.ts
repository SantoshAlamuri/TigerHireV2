import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  ensureOrganisationAccess,
  jsonError,
  jsonSuccess,
  handleApiError,
  parseJsonBody,
  handleZodError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { hasAnyEnterpriseRole } from "@/lib/security/enterprise-roles";
import { getOrgSettingsPermissions, hasSettingsCapability } from "@/lib/settings/permissions";
import { patchDraftOfferSchema } from "@/lib/validations/offers";
import {
  isMissingOfferTemplateCustomMergeColumn,
  parseCustomMergeFieldDefs,
  resolvedCustomMergeValues,
} from "@/lib/offers/offer-custom-merge-fields";
import { ensureDefaultOfferPdfTemplate } from "@/lib/offers/offer-pdf-template";
import { resolveOfferBandMetadata } from "@/lib/offers/compensation-band-check";
import { normalizeCompensationForStorage } from "@/lib/offers/compensation-normalize";
import { forbidUnlessHiringManagerOwnsOfferJob } from "@/lib/security/hiring-manager-offer-access";

type RouteContext = { params: Promise<{ id: string }> };

const OFFER_ALL_COLUMNS =
  "id, application_id, organisation_id, created_by, role_title, start_date, status, compensation_json, notes, sent_at, responded_at, expires_at, created_at, updated_at, public_token, public_token_otp, public_token_otp_expires_at, public_token_viewed_at, offer_pdf_template_id, offer_pdf_template_version_id, band_id, band_exception_reason, band_status, band_checked_at, signing_status, first_viewed_at, last_viewed_at, view_count, signed_at, declined_at, expired_at, signer_name, signer_ip, signer_user_agent, document_hash, document_content, signed_pdf_path, decline_reason, last_signing_reminder_at, letter_variables, company_signer_name, company_signer_email, company_sign_token, company_sign_requested_at, company_signed_at, company_signer_ip, company_signer_user_agent";

/**
 * PATCH /api/offers/[id] — update draft offer (compensation, band, role, dates, notes, letter merge values).
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const { id } = await context.params;
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);

    const supabase = await createSupabaseServerClient();
    const allowed = await hasAnyEnterpriseRole(
      ctx.userId,
      ["leadership", "recruiter", "hiring_manager", "super_admin"],
      supabase,
    );
    if (!allowed) return jsonError("Forbidden", 403);

    const rolePermissions = await getOrgSettingsPermissions(supabase, ctx.organisationId);
    const canCreate =
      ctx.role === "leadership" ||
      ctx.role === "super_admin" ||
      hasSettingsCapability(ctx.role, "create_offers", rolePermissions);
    if (!canCreate) {
      return jsonError(
        "Offer updates are disabled for your role. Ask your company admin to enable offer creation.",
        403,
      );
    }

    const { body, errorResponse } = await parseJsonBody(request, "PATCH /api/offers/[id]");
    if (errorResponse) return errorResponse;
    const parsed = patchDraftOfferSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const admin = createSupabaseAdmin();
    const { data: offer, error: offerErr } = await admin
      .from("offers")
      .select(
        "id, status, organisation_id, offer_pdf_template_id, band_id, compensation_json, role_title, start_date, notes, band_exception_reason, company_signer_name, company_signer_email",
      )
      .eq("id", id)
      .maybeSingle();
    if (offerErr || !offer) return jsonError("Offer not found", 404);
    const orgErr = ensureOrganisationAccess(ctx, offer.organisation_id as string);
    if (orgErr) return orgErr;

    const hmErr = await forbidUnlessHiringManagerOwnsOfferJob({ ctx, admin, offerId: id });
    if (hmErr) return hmErr;

    if ((offer.status as string) !== "draft") {
      return jsonError("Only draft offers can be updated", 409);
    }

    const orgId = offer.organisation_id as string;
    let templateIdForDefs = (offer.offer_pdf_template_id as string | null) ?? null;
    if (!templateIdForDefs) {
      const { data: defT } = await admin
        .from("offer_pdf_templates")
        .select("id")
        .eq("organisation_id", orgId)
        .eq("is_default", true)
        .eq("is_archived", false)
        .maybeSingle();
      templateIdForDefs =
        (defT?.id as string | undefined) ??
        (await ensureDefaultOfferPdfTemplate(admin, orgId, ctx.userId));
    }

    const { data: tplRow, error: tplErr } = await admin
      .from("offer_pdf_templates")
      .select("custom_merge_field_defs")
      .eq("id", templateIdForDefs)
      .eq("organisation_id", orgId)
      .maybeSingle();
    let defs: ReturnType<typeof parseCustomMergeFieldDefs> = [];
    if (tplErr) {
      if (!isMissingOfferTemplateCustomMergeColumn(tplErr)) {
        return jsonError(tplErr.message, 500);
      }
    } else if (!tplRow) {
      return jsonError("Offer PDF template not found for this organisation", 400);
    } else {
      defs = parseCustomMergeFieldDefs(
        (tplRow as { custom_merge_field_defs?: unknown }).custom_merge_field_defs,
      );
    }

    const updateRow: Record<string, unknown> = {};

    if (parsed.data.letterVariables !== undefined) {
      updateRow.letter_variables = resolvedCustomMergeValues(defs, parsed.data.letterVariables);
    }
    if (parsed.data.roleTitle !== undefined) {
      updateRow.role_title = parsed.data.roleTitle.trim();
    }
    if (parsed.data.startDate !== undefined) {
      updateRow.start_date = parsed.data.startDate;
    }
    if (parsed.data.notes !== undefined) {
      updateRow.notes = parsed.data.notes;
    }
    if (
      parsed.data.companySignerName !== undefined &&
      parsed.data.companySignerEmail !== undefined
    ) {
      const nextName = parsed.data.companySignerName?.trim() ?? null;
      const nextEmail = parsed.data.companySignerEmail?.trim().toLowerCase() ?? null;
      updateRow.company_signer_name = nextName;
      updateRow.company_signer_email = nextEmail;
    }

    const mergedComp =
      parsed.data.compensation !== undefined
        ? normalizeCompensationForStorage(parsed.data.compensation as Record<string, unknown>)
        : ((offer.compensation_json as Record<string, unknown> | null) ?? {});

    if (parsed.data.compensation !== undefined) {
      updateRow.compensation_json = mergedComp;
    }

    const touchesBand =
      parsed.data.compensation !== undefined ||
      parsed.data.bandId !== undefined ||
      parsed.data.bandExceptionReason !== undefined;

    if (touchesBand) {
      const mergedBandId =
        parsed.data.bandId !== undefined
          ? parsed.data.bandId
          : ((offer.band_id as string | null) ?? null);
      const mergedReason =
        parsed.data.bandExceptionReason !== undefined
          ? parsed.data.bandExceptionReason
          : ((offer.band_exception_reason as string | null) ?? "");

      const bandRes = await resolveOfferBandMetadata(admin, {
        organisationId: orgId,
        bandId: mergedBandId,
        compensationJson: mergedComp,
        bandExceptionReason: mergedReason,
      });
      if (!bandRes.ok) {
        return NextResponse.json(bandRes.body, { status: bandRes.status });
      }
      updateRow.band_status = bandRes.bandStatus;
      updateRow.band_exception_reason = bandRes.bandExceptionReason;
      updateRow.band_checked_at = new Date().toISOString();
      if (parsed.data.bandId !== undefined) {
        updateRow.band_id = parsed.data.bandId;
      }
    }

    if (Object.keys(updateRow).length === 0) {
      return jsonError("No valid fields to update", 400);
    }

    const { data: updated, error: updErr } = await admin
      .from("offers")
      .update(updateRow)
      .eq("id", id)
      .eq("organisation_id", orgId)
      .eq("status", "draft")
      .select(OFFER_ALL_COLUMNS)
      .single();
    if (updErr || !updated) return jsonError(updErr?.message ?? "Failed to update offer", 500);

    return jsonSuccess({ offer: updated });
  } catch (err) {
    return handleApiError(err, "Failed to update offer", { route: "PATCH /api/offers/[id]" });
  }
}

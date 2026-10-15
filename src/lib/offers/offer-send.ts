import crypto from "node:crypto";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/services/notifications";
import { logger } from "@/lib/observability/logger";
import { recordHiringOfferAuditEvent } from "@/lib/audit/hiring-offer-audit";
import { env } from "@/lib/config/env";
import { getOrgSettingsPermissions, hasSettingsCapability } from "@/lib/settings/permissions";
import { resolveBandExceptionApproverIds } from "@/lib/offers/band-exception-approvers";
import { notifyBandExceptionApprovers } from "@/lib/approvals/notify-band-exception-offer-approval";
import { buildFrozenOfferLetterHtml, sha256HexOfUtf8 } from "@/lib/offers/offer-document-html";
import { interpolateOfferTemplate } from "@/lib/offers/interpolate-offer-template";
import { resolvedCustomMergeValues } from "@/lib/offers/offer-custom-merge-fields";
import {
  buildOfferTemplateVariables,
  resolveOfferPdfTemplateForSend,
} from "@/lib/offers/offer-pdf-template";
import { insertOfferEvent } from "@/lib/offers/offer-events";
import { insertGeneratedOfferDocumentVersion } from "@/lib/offers/offer-document-versions";
import {
  sendNativeCompanySignerInviteEmail,
  sendNativeOfferSentRecruiterEmail,
  sendNativeOfferSigningInviteEmail,
} from "@/lib/offers/offer-native-notifications";
import { validateOfferTransition } from "@/lib/workflows/offer-state-machine";
import type { UserRole } from "@/types/database";

const OFFER_ALL_COLUMNS =
  "id, application_id, organisation_id, created_by, role_title, start_date, status, compensation_json, notes, sent_at, responded_at, expires_at, created_at, updated_at, public_token, public_token_otp, public_token_otp_expires_at, public_token_viewed_at, offer_pdf_template_id, offer_pdf_template_version_id, band_id, band_exception_reason, band_status, band_checked_at, signing_status, first_viewed_at, last_viewed_at, view_count, signed_at, declined_at, expired_at, signer_name, signer_ip, signer_user_agent, document_hash, document_content, signed_pdf_path, decline_reason, last_signing_reminder_at, letter_variables, company_signer_name, company_signer_email, company_sign_token, company_sign_requested_at, company_signed_at, company_signer_ip, company_signer_user_agent";

export type OfferSendExecutionResult =
  | { ok: true; offer: Record<string, unknown> }
  | {
      ok: false;
      status: number;
      error: string;
      body?: Record<string, unknown>;
    };

export async function executeOfferSend(params: {
  offerId: string;
  actorProfileId: string;
  actorRole: string;
  actorOrganisationId?: string | null;
  requestIp: string | null;
  userAgent?: string | null;
  enforceSendCapability: boolean;
  logRoute: string;
}): Promise<OfferSendExecutionResult> {
  const admin = createSupabaseAdmin();

  const { data: offer, error: offerError } = await admin
    .from("offers")
    .select(
      "id, status, expires_at, organisation_id, application_id, role_title, start_date, compensation_json, notes, offer_pdf_template_id, created_by, band_status, letter_variables, company_signer_name, company_signer_email, applications(candidate_id)",
    )
    .eq("id", params.offerId)
    .single();
  if (offerError || !offer) return { ok: false, status: 404, error: "Offer not found" };

  if (
    params.actorRole !== "super_admin" &&
    params.actorOrganisationId &&
    params.actorOrganisationId !== (offer.organisation_id as string)
  ) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  if (params.enforceSendCapability) {
    const supabase = await createSupabaseServerClient();
    const rolePermissions = await getOrgSettingsPermissions(
      supabase,
      offer.organisation_id as string,
    );
    const maySend =
      params.actorRole === "leadership" ||
      params.actorRole === "super_admin" ||
      hasSettingsCapability(params.actorRole as UserRole, "send_offers", rolePermissions);
    if (!maySend) {
      return {
        ok: false,
        status: 403,
        error:
          "Sending offers is disabled for your role. Ask your company admin to enable “send offers” for recruiters or HR.",
      };
    }
  }

  if (offer.expires_at && new Date(offer.expires_at).getTime() < Date.now()) {
    return { ok: false, status: 409, error: "Offer has expired" };
  }
  const transition = validateOfferTransition({
    from: String(offer.status ?? ""),
    to: "sent",
    actorRole: params.actorRole,
  });
  if (!transition.ok) return { ok: false, status: transition.status, error: transition.error };

  const bandStatus = offer.band_status as string | null;
  if (bandStatus === "exception_rejected") {
    return { ok: false, status: 400, error: "band_exception_rejected" };
  }
  if (bandStatus === "exception_pending") {
    const orgId = offer.organisation_id as string;
    const rolePermissions = await getOrgSettingsPermissions(admin, orgId);
    const approverIds = await resolveBandExceptionApproverIds(admin, orgId, rolePermissions);
    await notifyBandExceptionApprovers(admin, {
      organisationId: orgId,
      offerId: params.offerId,
      roleTitle: (offer.role_title as string) ?? "Offer",
      approverIds,
      routeLog: params.logRoute,
    });
    return {
      ok: false,
      status: 202,
      error: "exception_approval_pending",
      body: {
        status: "exception_approval_pending",
        message: "Offer is outside compensation band and requires approval.",
      },
    };
  }

  const candidate = offer.applications as { candidate_id?: string } | null;
  if (!candidate?.candidate_id) {
    return { ok: false, status: 400, error: "Application is missing a candidate for this offer." };
  }

  const { data: candidateRecord, error: candErr } = await admin
    .from("candidates")
    .select("user_id, name, full_name, email")
    .eq("id", candidate.candidate_id)
    .single();
  if (candErr || !candidateRecord) {
    return { ok: false, status: 400, error: "Candidate not found for this offer." };
  }
  const candidateEmail = ((candidateRecord.email as string | null) ?? "").trim();
  if (!candidateEmail) {
    return {
      ok: false,
      status: 400,
      error:
        "This candidate has no email on file. Add an email to the candidate profile before sending an offer.",
    };
  }

  const { data: orgRow } = await admin
    .from("organisations")
    .select("name")
    .eq("id", offer.organisation_id as string)
    .maybeSingle();
  const companyName = (orgRow?.name as string | null) ?? "Your organisation";
  const candidateDisplay =
    ((candidateRecord.full_name as string | null) ?? "").trim() ||
    ((candidateRecord.name as string | null) ?? "").trim() ||
    "Candidate";

  const resolved = await resolveOfferPdfTemplateForSend(
    admin,
    offer.organisation_id as string,
    (offer.offer_pdf_template_id as string | null) ?? null,
    (offer.created_by as string | null) ?? params.actorProfileId,
  );
  const vars = buildOfferTemplateVariables({
    companyName,
    candidateName: candidateDisplay,
    roleTitle: offer.role_title as string,
    startDate: offer.start_date as string,
    compensation: (offer.compensation_json as Record<string, unknown>) ?? {},
    notes: (offer.notes as string | null) ?? null,
  });
  const customMerged = resolvedCustomMergeValues(
    resolved.customMergeFieldDefs,
    (offer as { letter_variables?: unknown }).letter_variables,
  );
  const plainBody = interpolateOfferTemplate(resolved.bodyText, vars, customMerged);
  const documentContent = buildFrozenOfferLetterHtml({
    companyName,
    roleTitle: offer.role_title as string,
    plainBody,
  });
  const documentHash = sha256HexOfUtf8(documentContent);

  const publicToken = crypto.randomBytes(32).toString("hex");
  const companySignerName = ((offer.company_signer_name as string | null) ?? "").trim();
  const companySignerEmail = ((offer.company_signer_email as string | null) ?? "")
    .trim()
    .toLowerCase();
  if ((companySignerName && !companySignerEmail) || (!companySignerName && companySignerEmail)) {
    return {
      ok: false,
      status: 400,
      error:
        "Offer has incomplete company signer details. Set both signer name and email, or clear both.",
    };
  }
  const hasCompanySigner = Boolean(companySignerName) && Boolean(companySignerEmail);
  const companySignToken = hasCompanySigner ? crypto.randomBytes(32).toString("hex") : null;
  const sentAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: updated, error: updateError } = await admin
    .from("offers")
    .update({
      status: "sent",
      sent_at: sentAt,
      public_token: publicToken,
      expires_at: expiresAt,
      document_content: documentContent,
      document_hash: documentHash,
      offer_pdf_template_version_id: resolved.templateVersionId,
      signing_status: hasCompanySigner ? "pending_company" : "sent",
      company_sign_token: companySignToken,
      company_sign_requested_at: hasCompanySigner ? sentAt : null,
      company_signed_at: null,
      company_signer_ip: null,
      company_signer_user_agent: null,
      first_viewed_at: null,
      last_viewed_at: null,
      view_count: 0,
      last_signing_reminder_at: null,
    })
    .eq("id", params.offerId)
    .eq("status", offer.status as string)
    .select(OFFER_ALL_COLUMNS)
    .single();
  if (updateError || !updated) return { ok: false, status: 500, error: "Failed to send offer" };

  await insertOfferEvent(admin, {
    offerId: params.offerId,
    eventType: "sent",
    actorIp: params.requestIp,
    actorUserAgent: params.userAgent ?? null,
    metadata: { channel: "send_route" },
  });

  await insertGeneratedOfferDocumentVersion(
    admin,
    params.offerId,
    documentHash,
    params.actorProfileId,
  );

  await recordHiringOfferAuditEvent({
    organisationId: offer.organisation_id as string,
    entityType: "offer",
    entityId: params.offerId,
    eventType: "OFFER_SENT",
    actorProfileId: params.actorProfileId,
    actorRole: params.actorRole,
    prevStatus: String(offer.status),
    newStatus: "sent",
    ipAddress: params.requestIp ?? undefined,
  });

  if (hasCompanySigner && companySignToken) {
    await sendNativeCompanySignerInviteEmail({
      signerEmail: companySignerEmail,
      signerName: companySignerName,
      roleTitle: offer.role_title as string,
      companyName,
      signingUrl: `${env.baseUrl}/offers/company-sign/${companySignToken}`,
    });
  } else {
    const candidateUserId = (candidateRecord.user_id as string | null) ?? null;
    if (candidateUserId) {
      const publicOfferUrl = `${env.baseUrl}/offers/${publicToken}`;
      const ok = await createNotification({
        userId: candidateUserId,
        type: "application_update",
        title: "You have received an offer",
        body: `Review and sign your offer letter (no account required): ${publicOfferUrl}`,
        link: `/candidate/applications`,
        metadata: { offerId: params.offerId, publicOfferUrl },
      });
      if (!ok) {
        logger.warn("createNotification failed", {
          route: params.logRoute,
          userId: candidateUserId,
        });
      }
    }

    await sendNativeOfferSigningInviteEmail({
      candidateEmail,
      candidateName: candidateDisplay,
      roleTitle: offer.role_title as string,
      companyName,
      publicToken,
    });
  }

  await sendNativeOfferSentRecruiterEmail(admin, {
    createdByProfileId: (offer.created_by as string | null) ?? null,
    candidateName: candidateDisplay,
    roleTitle: offer.role_title as string,
    companyName,
  });

  return { ok: true, offer: updated as Record<string, unknown> };
}

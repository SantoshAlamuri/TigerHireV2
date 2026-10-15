import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
  handleZodError,
} from "@/lib/api-helpers";
import { createOfferSchema } from "@/lib/validations/offers";
import { hasAnyEnterpriseRole } from "@/lib/security/enterprise-roles";
import { notifyHiringManagerOfferDraft } from "@/lib/approvals/notify-hm-offer-draft";
import { getOrgSettingsPermissions, hasSettingsCapability } from "@/lib/settings/permissions";
import { validateOrigin } from "@/lib/security/csrf";
import { recordHiringOfferAuditEvent } from "@/lib/audit/hiring-offer-audit";
import { getRequestClientIp } from "@/lib/audit/client-ip";
import { resolveOfferBandMetadata } from "@/lib/offers/compensation-band-check";
import { normalizeCompensationForStorage } from "@/lib/offers/compensation-normalize";
import { assertOfferPipelineStageAllowed } from "@/lib/offers/offer-pipeline-stage-gate";
import {
  isMissingOfferTemplateCustomMergeColumn,
  parseCustomMergeFieldDefs,
  resolvedCustomMergeValues,
} from "@/lib/offers/offer-custom-merge-fields";
import { ensureDefaultOfferPdfTemplate } from "@/lib/offers/offer-pdf-template";
import { hiringRequestGateErrorForOffer } from "@/lib/offers/hiring-request-offer-gate";
import { env } from "@/lib/config/env";

const offersPaginationQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

const OFFER_ALL_COLUMNS =
  "id, application_id, organisation_id, created_by, role_title, start_date, status, compensation_json, notes, sent_at, responded_at, expires_at, created_at, updated_at, public_token, public_token_otp, public_token_otp_expires_at, public_token_viewed_at, offer_pdf_template_id, offer_pdf_template_version_id, band_id, band_exception_reason, band_status, band_checked_at, signing_status, first_viewed_at, last_viewed_at, view_count, signed_at, declined_at, expired_at, signer_name, signer_ip, signer_user_agent, document_hash, document_content, signed_pdf_path, decline_reason, last_signing_reminder_at, letter_variables, company_signer_name, company_signer_email, company_sign_token, company_sign_requested_at, company_signed_at, company_signer_ip, company_signer_user_agent";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);

    const paginationParsed = offersPaginationQuerySchema.safeParse({
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
      offset: request.nextUrl.searchParams.get("offset") ?? undefined,
    });
    if (!paginationParsed.success) return handleZodError(paginationParsed.error);
    const { limit, offset } = paginationParsed.data;
    const rangeEnd = offset + limit;

    const supabase = await createSupabaseServerClient();

    if (ctx.role === "candidate_pro" || ctx.role === "candidate_free") {
      const { data: candidate, error: candidateError } = await supabase
        .from("candidates")
        .select("id")
        .eq("user_id", ctx.userId)
        .maybeSingle();
      if (candidateError) return jsonError("Failed to resolve candidate profile", 500);
      if (!candidate?.id) {
        return jsonSuccess({
          offers: [],
          pagination: { limit, offset, hasMore: false },
        });
      }

      const { data, error } = await supabase
        .from("offers")
        .select(
          "id, application_id, role_title, start_date, status, signing_status, compensation_json, notes, sent_at, expires_at, created_at, offer_pdf_template_id, public_token, first_viewed_at, last_viewed_at, view_count, signed_at, signer_name, declined_at, expired_at, document_hash, signed_pdf_path, decline_reason, band_id, band_status, band_exception_reason, company_signer_name, company_signer_email, company_signed_at, applications!inner(candidate_id)",
        )
        .eq("organisation_id", ctx.organisationId)
        .eq("applications.candidate_id", candidate.id)
        .order("created_at", { ascending: false })
        .range(offset, rangeEnd);
      if (error) return jsonError("Failed to load offers", 500);
      const rows = data ?? [];
      const hasMore = rows.length > limit;
      return jsonSuccess({
        offers: rows.slice(0, limit),
        pagination: { limit, offset, hasMore },
      });
    }

    const allowed = await hasAnyEnterpriseRole(
      ctx.userId,
      ["leadership", "recruiter", "hiring_manager", "finance", "super_admin"],
      supabase,
    );
    if (!allowed) return jsonError("Forbidden", 403);

    const baseSelect =
      "id, application_id, role_title, start_date, status, signing_status, compensation_json, notes, sent_at, expires_at, created_at, offer_pdf_template_id, public_token, first_viewed_at, last_viewed_at, view_count, signed_at, signer_name, declined_at, expired_at, document_hash, signed_pdf_path, decline_reason, band_id, band_status, band_exception_reason, company_signer_name, company_signer_email, company_signed_at, applications!inner(candidate_id, job_id, jobs!inner(id, title, hiring_manager_id, hiring_requests!jobs_hiring_request_id_fkey(id, req_code, title))), offer_approvals(id, decision, comment, approver_id, decided_at), offer_candidate_responses(id, response, comment, responded_at)";

    let offersQuery = supabase
      .from("offers")
      .select(baseSelect)
      .eq("organisation_id", ctx.organisationId)
      .order("created_at", { ascending: false })
      .range(offset, rangeEnd);

    if (hasRole(ctx, "hiring_manager")) {
      offersQuery = offersQuery.eq("applications.jobs.hiring_manager_id", ctx.userId);
    }

    const { data, error } = await offersQuery;

    if (error) return jsonError("Failed to load offers", 500);
    const rows = data ?? [];
    const hasMore = rows.length > limit;
    return jsonSuccess({
      offers: rows.slice(0, limit),
      pagination: { limit, offset, hasMore },
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch offers", { route: "GET /api/offers" });
  }
}

export async function POST(request: NextRequest) {
  const clientIp = getRequestClientIp(request);
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);

    const supabase = await createSupabaseServerClient();
    const hasWorkflowRole = await hasAnyEnterpriseRole(
      ctx.userId,
      ["leadership", "recruiter", "hiring_manager", "super_admin"],
      supabase,
    );
    if (!hasWorkflowRole) return jsonError("Forbidden", 403);

    const rolePermissions = await getOrgSettingsPermissions(supabase, ctx.organisationId);
    const canCreate =
      ctx.role === "leadership" ||
      ctx.role === "super_admin" ||
      hasSettingsCapability(ctx.role, "create_offers", rolePermissions);
    if (!canCreate) {
      return jsonError(
        "Offer creation is disabled for your role. Ask your company admin to enable it.",
        403,
      );
    }

    const { body, errorResponse } = await parseJsonBody(request, "POST /api/offers");
    if (errorResponse) return errorResponse;
    const parsed = createOfferSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const { data: application, error: applicationError } = await supabase
      .from("applications")
      .select(
        "id, candidate_id, job_id, jobs!inner(organisation_id, hiring_manager_id, hiring_request_id, hiring_requests!jobs_hiring_request_id_fkey(id, status, req_code))",
      )
      .eq("id", parsed.data.applicationId)
      .single();
    if (applicationError || !application) return jsonError("Application not found", 404);

    const jobs = application.jobs as {
      organisation_id?: string;
      hiring_manager_id?: string;
      hiring_request_id?: string | null;
      hiring_requests?: { id: string; status: string; req_code: string | null } | null;
    } | null;
    if (jobs?.organisation_id !== ctx.organisationId) return jsonError("Forbidden", 403);
    if (hasRole(ctx, "hiring_manager")) {
      if (!jobs?.hiring_manager_id || jobs.hiring_manager_id !== ctx.userId) {
        return jsonError("Forbidden", 403);
      }
    }

    let reqGate:
      | { ok: true; hiringRequest: { id: string; status: string; req_code: string | null } }
      | { ok: false; status: number; error: string };
    if (env.offerSkipHiringRequestLinkGate) {
      const hr = jobs?.hiring_requests;
      if (hr?.id) {
        reqGate = { ok: true, hiringRequest: hr };
      } else {
        reqGate = {
          ok: true,
          hiringRequest: { id: "", status: "skipped_gate", req_code: null },
        };
      }
    } else {
      reqGate = hiringRequestGateErrorForOffer({
        hiringRequestId: jobs?.hiring_request_id ?? null,
        hiringRequest: jobs?.hiring_requests ?? null,
      });
      if (!reqGate.ok) {
        return jsonError(reqGate.error, reqGate.status);
      }
    }

    const stageGate = await assertOfferPipelineStageAllowed(supabase, {
      applicationId: parsed.data.applicationId,
      skipPipelineStageGate: Boolean(rolePermissions.offerDraftSkipPipelineStageGate),
      stageNameMarkers: rolePermissions.offerPipelineStageMarkers,
    });
    if (!stageGate.allowed) {
      return jsonError(stageGate.message, 400);
    }

    const admin = createSupabaseAdmin();

    if (parsed.data.offerPdfTemplateId) {
      const { data: tpl, error: tplErr } = await admin
        .from("offer_pdf_templates")
        .select("id")
        .eq("id", parsed.data.offerPdfTemplateId)
        .eq("organisation_id", ctx.organisationId)
        .eq("is_archived", false)
        .maybeSingle();
      if (tplErr || !tpl?.id) {
        return jsonError("Unknown or archived offer PDF template for this organisation", 400);
      }
    }

    const compensationForSave = normalizeCompensationForStorage(
      (parsed.data.compensation ?? {}) as Record<string, unknown>,
    );

    const bandResolved = await resolveOfferBandMetadata(admin, {
      organisationId: ctx.organisationId,
      bandId: parsed.data.bandId,
      compensationJson: compensationForSave,
      bandExceptionReason: parsed.data.bandExceptionReason,
    });
    if (!bandResolved.ok) {
      return NextResponse.json(bandResolved.body, { status: bandResolved.status });
    }
    const bandStatus = bandResolved.bandStatus;

    const checkedAt = new Date().toISOString();

    let templateIdForLetterVars = parsed.data.offerPdfTemplateId ?? null;
    if (!templateIdForLetterVars) {
      const { data: defT } = await admin
        .from("offer_pdf_templates")
        .select("id")
        .eq("organisation_id", ctx.organisationId)
        .eq("is_default", true)
        .eq("is_archived", false)
        .maybeSingle();
      templateIdForLetterVars =
        (defT?.id as string | undefined) ??
        (await ensureDefaultOfferPdfTemplate(admin, ctx.organisationId, ctx.userId));
    }
    const { data: tplForVars, error: tplVarsErr } = await admin
      .from("offer_pdf_templates")
      .select("custom_merge_field_defs")
      .eq("id", templateIdForLetterVars)
      .eq("organisation_id", ctx.organisationId)
      .maybeSingle();
    let customDefs: ReturnType<typeof parseCustomMergeFieldDefs> = [];
    if (tplVarsErr) {
      if (!isMissingOfferTemplateCustomMergeColumn(tplVarsErr)) {
        return jsonError(tplVarsErr.message, 500);
      }
    } else {
      customDefs = parseCustomMergeFieldDefs(
        (tplForVars as { custom_merge_field_defs?: unknown } | null)?.custom_merge_field_defs,
      );
    }
    const letter_variables = resolvedCustomMergeValues(
      customDefs,
      parsed.data.letterVariables ?? {},
    );

    const { data: offer, error } = await admin
      .from("offers")
      .insert({
        application_id: parsed.data.applicationId,
        organisation_id: ctx.organisationId,
        created_by: ctx.userId,
        role_title: parsed.data.roleTitle,
        start_date: parsed.data.startDate,
        status: "draft",
        compensation_json: compensationForSave,
        notes: parsed.data.notes ?? null,
        expires_at: parsed.data.expiresAt ?? null,
        offer_pdf_template_id: parsed.data.offerPdfTemplateId ?? null,
        letter_variables,
        band_id: parsed.data.bandId ?? null,
        band_exception_reason: bandResolved.bandExceptionReason,
        band_status: bandStatus,
        band_checked_at: checkedAt,
        company_signer_name: parsed.data.companySignerName?.trim() || null,
        company_signer_email: parsed.data.companySignerEmail?.trim().toLowerCase() || null,
      })
      .select(OFFER_ALL_COLUMNS)
      .single();

    if (error || !offer) return jsonError("Failed to create offer", 500);

    await recordHiringOfferAuditEvent({
      organisationId: ctx.organisationId,
      entityType: "offer",
      entityId: offer.id as string,
      eventType: "OFFER_CREATED",
      actorProfileId: ctx.userId,
      actorRole: ctx.role,
      prevStatus: null,
      newStatus: "draft",
      ipAddress: clientIp,
      metadata: {
        application_id: parsed.data.applicationId,
        ...(reqGate.hiringRequest.id
          ? {
              hiring_request_id: reqGate.hiringRequest.id,
              req_code: reqGate.hiringRequest.req_code,
            }
          : {}),
        ...(env.offerSkipHiringRequestLinkGate ? { hiring_request_gate_skipped: true } : {}),
      },
    });

    await notifyHiringManagerOfferDraft(admin, {
      organisationId: ctx.organisationId,
      hiringManagerId: jobs?.hiring_manager_id,
      offerId: offer.id as string,
      roleTitle: parsed.data.roleTitle,
      routeLog: "POST /api/offers",
    });

    return jsonSuccess({ offer }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to create offer", { route: "POST /api/offers" });
  }
}

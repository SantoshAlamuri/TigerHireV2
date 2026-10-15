import { NextRequest } from "next/server";
import { z } from "zod";
import {
  handleApiError,
  handleZodError,
  jsonError,
  jsonSuccess,
  parseJsonBody,
} from "@/lib/api-helpers";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/security/platform-admin";
import { validateOrigin } from "@/lib/security/csrf";

const updateOnboardingRequestSchema = z
  .object({
    id: z.string().uuid(),
    onboardingStatus: z.enum(["pending", "approved", "handled", "cancelled"]),
    onboardingCompanyId: z.string().uuid().nullable().optional(),
    adminPayload: z.record(z.string(), z.unknown()).nullable().optional(),
    handledNotes: z.string().trim().max(1000).optional().default(""),
  })
  .strict();

const onboardingAdminPayloadSchema = z
  .object({
    legalCompanyName: z.string().trim().max(200).default(""),
    billingSpocName: z.string().trim().max(200).default(""),
    billingSpocEmail: z.string().trim().max(320).default(""),
    billingSpocPhone: z.string().trim().max(50).default(""),
    billingAddress: z.string().trim().max(500).default(""),
    gstin: z.string().trim().max(80).default(""),
    website: z.string().trim().max(200).default(""),
    notes: z.string().trim().max(2000).default(""),
    workflow: z
      .object({
        companyInfoSaved: z.boolean().default(false),
        billingProfileSaved: z.boolean().default(false),
        creditsConfigured: z.boolean().default(false),
        overridesReviewed: z.boolean().default(false),
      })
      .default({
        companyInfoSaved: false,
        billingProfileSaved: false,
        creditsConfigured: false,
        overridesReviewed: false,
      }),
  })
  .strict();

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePlatformAdmin(request);
    if (auth.error) return auth.error;

    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("contact_submissions")
      .select(
        "id, name, email, company, message, type, created_at, onboarding_domain, onboarding_role_title, onboarding_status, onboarding_company_id, onboarding_admin_payload, onboarding_activity, onboarding_approved_at, onboarding_approved_by, onboarding_handled_at, onboarding_handled_by, onboarding_handled_notes",
      )
      .not("onboarding_status", "is", null)
      .order("created_at", { ascending: false });

    if (error) return jsonError("Failed to load onboarding requests", 500);
    return jsonSuccess({ requests: data ?? [] });
  } catch (error) {
    return handleApiError(error, "Failed to load onboarding requests", {
      route: "GET /api/admin/onboarding-requests",
    });
  }
}

export async function PATCH(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const auth = await requirePlatformAdmin(request);
    if (auth.error) return auth.error;

    const parsedBody = await parseJsonBody(request, "PATCH /api/admin/onboarding-requests");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = updateOnboardingRequestSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const { id, onboardingStatus, onboardingCompanyId, adminPayload, handledNotes } = parsed.data;
    const admin = createSupabaseAdmin();
    const nowIso = new Date().toISOString();
    const { data: current, error: currentError } = await admin
      .from("contact_submissions")
      .select(
        "id, onboarding_status, onboarding_company_id, onboarding_admin_payload, onboarding_activity",
      )
      .eq("id", id)
      .not("onboarding_status", "is", null)
      .single();
    if (currentError || !current) return jsonError("Onboarding request not found", 404);

    const currentStatus = String(current.onboarding_status ?? "pending") as
      | "pending"
      | "approved"
      | "handled"
      | "cancelled";
    const nextStatus = onboardingStatus;
    if (currentStatus === "handled" && nextStatus !== "pending" && nextStatus !== "handled") {
      return jsonError("Handled requests can only be reopened to pending.", 409);
    }
    if (nextStatus === "approved" && !onboardingCompanyId && !current.onboarding_company_id) {
      return jsonError("Cannot approve without an associated company.", 409);
    }
    if (nextStatus === "handled") {
      const companyForHandled = onboardingCompanyId ?? current.onboarding_company_id;
      if (!companyForHandled) return jsonError("Complete approval before marking handled.", 409);
      if (currentStatus !== "approved" && currentStatus !== "handled") {
        return jsonError("Request must be approved before it can be marked handled.", 409);
      }
    }

    const mergedPayloadCandidate = adminPayload ??
      (current.onboarding_admin_payload as Record<string, unknown> | null) ?? {
        legalCompanyName: "",
        billingSpocName: "",
        billingSpocEmail: "",
        billingSpocPhone: "",
        billingAddress: "",
        gstin: "",
        website: "",
        notes: "",
        workflow: {
          companyInfoSaved: false,
          billingProfileSaved: false,
          creditsConfigured: false,
          overridesReviewed: false,
        },
      };
    const mergedPayloadParsed = onboardingAdminPayloadSchema.safeParse(mergedPayloadCandidate);
    if (!mergedPayloadParsed.success) {
      return jsonError("Invalid onboarding metadata payload.", 422);
    }
    const mergedPayload = mergedPayloadParsed.data;

    if (nextStatus === "handled") {
      if (
        !mergedPayload.legalCompanyName ||
        !mergedPayload.billingSpocName ||
        !mergedPayload.billingSpocEmail
      ) {
        return jsonError(
          "Legal company name and billing SPOC details are required before completion.",
          409,
        );
      }
      const spocEmailValid = z.string().email().safeParse(mergedPayload.billingSpocEmail).success;
      if (!spocEmailValid) return jsonError("Billing SPOC email must be valid.", 409);
      const wf = mergedPayload.workflow;
      if (
        !wf.companyInfoSaved ||
        !wf.billingProfileSaved ||
        !wf.creditsConfigured ||
        !wf.overridesReviewed
      ) {
        return jsonError(
          "Complete company info, billing profile, credits, and overrides before completion.",
          409,
        );
      }
    }

    const patch: Record<string, string | Record<string, unknown> | unknown[] | null> = {
      onboarding_status: onboardingStatus,
      onboarding_company_id: onboardingCompanyId ?? null,
      onboarding_admin_payload: mergedPayload,
      onboarding_approved_at: onboardingStatus === "approved" ? nowIso : null,
      onboarding_approved_by: onboardingStatus === "approved" ? auth.context.userId : null,
      onboarding_handled_at: onboardingStatus === "handled" ? nowIso : null,
      onboarding_handled_by: onboardingStatus === "handled" ? auth.context.userId : null,
      onboarding_handled_notes: onboardingStatus === "handled" ? handledNotes || null : null,
    };
    const activityEntry = {
      at: nowIso,
      actor_user_id: auth.context.userId,
      from_status: currentStatus,
      to_status: onboardingStatus,
      company_id: onboardingCompanyId ?? current.onboarding_company_id ?? null,
    };
    patch.onboarding_activity = [
      ...((current.onboarding_activity as unknown[]) ?? []).filter((item) => Boolean(item)),
      activityEntry,
    ];

    const { data, error } = await admin
      .from("contact_submissions")
      .update(patch)
      .eq("id", id)
      .not("onboarding_status", "is", null)
      .select(
        "id, name, email, company, message, type, created_at, onboarding_domain, onboarding_role_title, onboarding_status, onboarding_company_id, onboarding_admin_payload, onboarding_activity, onboarding_approved_at, onboarding_approved_by, onboarding_handled_at, onboarding_handled_by, onboarding_handled_notes",
      )
      .single();

    if (error) return jsonError("Failed to update onboarding request", 500);
    if (data?.onboarding_company_id) {
      await admin.from("audit_log").insert({
        organisation_id: data.onboarding_company_id,
        actor_user_id: auth.context.userId,
        actor_email: null,
        event_type: `admin.onboarding_request.${onboardingStatus}`,
        resource_type: "onboarding_request",
        resource_id: data.id,
        metadata: {
          from_status: currentStatus,
          to_status: onboardingStatus,
          has_admin_payload: Boolean(data.onboarding_admin_payload),
        },
      });
    }
    return jsonSuccess({ request: data });
  } catch (error) {
    return handleApiError(error, "Failed to update onboarding request", {
      route: "PATCH /api/admin/onboarding-requests",
    });
  }
}

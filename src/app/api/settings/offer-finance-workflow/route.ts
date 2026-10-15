import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  jsonError,
  jsonSuccess,
  handleApiError,
  handleZodError,
  parseJsonBody,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import {
  DEFAULT_SETTINGS_PERMISSIONS,
  resolveOfferFinanceApprovalWorkflowDefinitionKey,
  type SettingsPermissions,
} from "@/lib/settings/permissions";
import {
  OFFER_FINANCE_APPROVAL_WORKFLOW_KEY_ENUM,
  listOfferFinanceApprovalWorkflowOptions,
} from "@/lib/workflows/offer-finance-approval-definitions";

const updateSchema = z.object({
  offerFinanceApprovalWorkflowKey: z.enum(OFFER_FINANCE_APPROVAL_WORKFLOW_KEY_ENUM).optional(),
  offerFinanceApprovalMode: z.enum(["always"]).optional(),
});

function canConfigureOfferFinanceWorkflow(role: string): boolean {
  return role === "leadership" || role === "super_admin" || role === "recruiter";
}

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);
    if (!canConfigureOfferFinanceWorkflow(ctx.role)) return jsonError("Forbidden", 403);

    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("role_permission_settings")
      .select("permissions")
      .eq("organisation_id", ctx.organisationId)
      .maybeSingle();

    if (error) throw error;

    const merged: SettingsPermissions = {
      ...DEFAULT_SETTINGS_PERMISSIONS,
      ...((data?.permissions as Partial<SettingsPermissions> | undefined) ?? {}),
    };

    return jsonSuccess({
      offerFinanceApprovalWorkflowKey: resolveOfferFinanceApprovalWorkflowDefinitionKey(merged),
      offerFinanceApprovalMode: "always",
      options: listOfferFinanceApprovalWorkflowOptions(),
    });
  } catch (err) {
    return handleApiError(err, "Failed to load offer finance workflow settings", {
      route: "GET /api/settings/offer-finance-workflow",
    });
  }
}

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);
    if (!canConfigureOfferFinanceWorkflow(ctx.role)) return jsonError("Forbidden", 403);

    const { body, errorResponse } = await parseJsonBody(
      request,
      "POST /api/settings/offer-finance-workflow",
    );
    if (errorResponse) return errorResponse;
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const admin = createSupabaseAdmin();
    const { data: row, error: readErr } = await admin
      .from("role_permission_settings")
      .select("permissions")
      .eq("organisation_id", ctx.organisationId)
      .maybeSingle();

    if (readErr) throw readErr;

    const mergedPermissions: SettingsPermissions = {
      ...DEFAULT_SETTINGS_PERMISSIONS,
      ...((row?.permissions as Partial<SettingsPermissions> | undefined) ?? {}),
    };
    const nextPermissions: SettingsPermissions = {
      ...mergedPermissions,
      offerFinanceApprovalWorkflowKey:
        parsed.data.offerFinanceApprovalWorkflowKey ??
        resolveOfferFinanceApprovalWorkflowDefinitionKey(mergedPermissions),
      offerFinanceApprovalMode: "always",
    };

    const { error: writeErr } = await admin.from("role_permission_settings").upsert(
      {
        organisation_id: ctx.organisationId,
        permissions: nextPermissions,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organisation_id" },
    );

    if (writeErr) throw writeErr;

    return jsonSuccess({
      offerFinanceApprovalWorkflowKey:
        resolveOfferFinanceApprovalWorkflowDefinitionKey(nextPermissions),
      offerFinanceApprovalMode: "always",
      options: listOfferFinanceApprovalWorkflowOptions(),
    });
  } catch (err) {
    return handleApiError(err, "Failed to save offer finance workflow settings", {
      route: "POST /api/settings/offer-finance-workflow",
    });
  }
}

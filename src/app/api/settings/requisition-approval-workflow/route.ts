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
  isRequisitionAdvancedModeEnabled,
  resolveRequisitionApprovalWorkflowDefinitionKey,
  type SettingsPermissions,
} from "@/lib/settings/permissions";
import {
  REQUISITION_APPROVAL_WORKFLOW_KEY_ENUM,
  listRequisitionApprovalWorkflowOptions,
} from "@/lib/workflows/requisition-approval-definitions";

const updateSchema = z
  .object({
    requisitionApprovalWorkflowKey: z.enum(REQUISITION_APPROVAL_WORKFLOW_KEY_ENUM),
  })
  .strict();

function canConfigureRequisitionWorkflow(ctx: { role: string; isOrgAdmin?: boolean }): boolean {
  if (ctx.role === "super_admin") return true;
  return Boolean(ctx.isOrgAdmin);
}

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);
    if (!canConfigureRequisitionWorkflow(ctx)) return jsonError("Forbidden", 403);

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
      requisitionApprovalWorkflowKey: resolveRequisitionApprovalWorkflowDefinitionKey(merged),
      options: listRequisitionApprovalWorkflowOptions(),
    });
  } catch (err) {
    return handleApiError(err, "Failed to load requisition workflow settings", {
      route: "GET /api/settings/requisition-approval-workflow",
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
    if (!canConfigureRequisitionWorkflow(ctx)) return jsonError("Forbidden", 403);

    const { body, errorResponse } = await parseJsonBody(
      request,
      "POST /api/settings/requisition-approval-workflow",
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

    const nextPermissions: SettingsPermissions = {
      ...DEFAULT_SETTINGS_PERMISSIONS,
      ...((row?.permissions as Partial<SettingsPermissions> | undefined) ?? {}),
      requisitionApprovalWorkflowKey: parsed.data.requisitionApprovalWorkflowKey,
    };

    if (!isRequisitionAdvancedModeEnabled(nextPermissions)) {
      return jsonError(
        "Requisition advanced mode is disabled. Enable it in Settings > Permissions first.",
        409,
      );
    }

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
      requisitionApprovalWorkflowKey:
        resolveRequisitionApprovalWorkflowDefinitionKey(nextPermissions),
      options: listRequisitionApprovalWorkflowOptions(),
    });
  } catch (err) {
    return handleApiError(err, "Failed to save requisition workflow settings", {
      route: "POST /api/settings/requisition-approval-workflow",
    });
  }
}

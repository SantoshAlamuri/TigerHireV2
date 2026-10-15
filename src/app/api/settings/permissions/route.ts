import { NextRequest } from "next/server";
import { handleApiError, handleZodError, jsonSuccess, parseJsonBody } from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSettingsAdmin } from "@/lib/settings/server";
import { permissionsSettingsSchema } from "@/lib/validations/integrations";
import { writeAuditLog } from "@/lib/repositories/integrations.repository";
import { validateOrigin } from "@/lib/security/csrf";

const DEFAULT_PERMISSIONS = {
  recruiterCanManageIntegrations: false,
  recruiterCanManagePrivacy: false,
  recruiterCanReadAudit: false,
  hiringManagerCanViewSettings: false,
  hiringManagerCanReadAudit: false,
  recruiterCanCreateOffers: true,
  hiringManagerCanCreateOffers: false,
  recruiterCanCreateAssessments: true,
  hiringManagerCanCreateAssessments: true,
  recruiterCanManageAssessmentTemplates: true,
  hiringManagerCanManageAssessmentTemplates: true,
  requisitionAdvancedMode: false,
} as const;

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSettingsAdmin(request, { capability: "manage_permissions" });
    if (auth.error) return auth.error;

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("role_permission_settings")
      .select("permissions")
      .eq("organisation_id", auth.context.organisationId)
      .maybeSingle();
    if (error) throw error;

    return jsonSuccess({
      permissions: {
        ...DEFAULT_PERMISSIONS,
        ...(data?.permissions ?? {}),
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to load role permissions", {
      route: "GET /api/settings/permissions",
    });
  }
}

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const auth = await requireSettingsAdmin(request, {
      validateCsrf: true,
      capability: "manage_permissions",
    });
    if (auth.error) return auth.error;

    const { body, errorResponse } = await parseJsonBody(request, "POST /api/settings/permissions");
    if (errorResponse) return errorResponse;
    const parsed = permissionsSettingsSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const supabase = await createSupabaseServerClient();

    // Merge into existing permissions so keys owned by sibling routes
    // (e.g. offerLetterFlow from /api/settings/offer-letter-flow) are preserved
    // rather than clobbered by a full replace.
    const { data: existingRow, error: readErr } = await supabase
      .from("role_permission_settings")
      .select("permissions")
      .eq("organisation_id", auth.context.organisationId)
      .maybeSingle();
    if (readErr) throw readErr;
    const existingPermissions =
      (existingRow?.permissions as Record<string, unknown> | undefined) ?? {};
    const mergedPermissions = { ...existingPermissions, ...parsed.data };

    const { data, error } = await supabase
      .from("role_permission_settings")
      .upsert(
        {
          organisation_id: auth.context.organisationId,
          permissions: mergedPermissions,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organisation_id" },
      )
      .select("permissions")
      .single();
    if (error) throw error;

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    await writeAuditLog(supabase, {
      organisation_id: auth.context.organisationId,
      actor_user_id: auth.context.userId,
      actor_email: auth.context.actorEmail,
      event_type: "permission.updated",
      resource_type: "role_permission_settings",
      resource_id: auth.context.organisationId,
      metadata: parsed.data,
      ip_address: ip,
    });

    return jsonSuccess({
      permissions: {
        ...DEFAULT_PERMISSIONS,
        ...(data?.permissions ?? {}),
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to save role permissions", {
      route: "POST /api/settings/permissions",
    });
  }
}

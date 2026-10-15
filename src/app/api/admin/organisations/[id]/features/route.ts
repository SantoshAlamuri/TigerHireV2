import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
  handleZodError,
  parseJsonBody,
} from "@/lib/api-helpers";
import {
  ENTITLEMENT_FEATURE_KEYS,
  ENTITLEMENT_LABELS,
  type EntitlementFeatureKey,
} from "@/lib/entitlements/config";
import {
  adminOrgFeatureOverrideDeleteSchema,
  adminOrgFeatureOverrideSchema,
} from "@/lib/validations/organisations";
import { invalidateOrganisationEntitlement } from "@/lib/entitlements";
import { validateOrigin } from "@/lib/security/csrf";

type FeatureState = {
  key: EntitlementFeatureKey;
  label: string;
  planDefault: boolean;
  override: boolean | null;
  effective: boolean;
};

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const admin = createSupabaseAdmin();
    const { data: org, error: orgError } = await admin
      .from("organisations")
      .select("id, company_plan")
      .eq("id", id)
      .single();
    if (orgError || !org) return jsonError("Organisation not found", 404);

    const planKey = (org.company_plan as string | null) ?? "starter";
    const { data: planRow } = await admin
      .from("billing_plans")
      .select("limits")
      .eq("plan_type", "company")
      .eq("plan_key", planKey)
      .maybeSingle();

    const { data: overrideRows } = await admin
      .from("organisation_feature_overrides")
      .select("feature_key, enabled")
      .eq("organisation_id", id);
    const overrideMap = new Map<string, boolean>();
    for (const row of overrideRows ?? []) {
      overrideMap.set(String(row.feature_key), Boolean(row.enabled));
    }

    const features = ENTITLEMENT_FEATURE_KEYS.map((key): FeatureState => {
      const planDefault =
        typeof (planRow?.limits as { features?: Record<string, unknown> } | undefined)?.features?.[
          key
        ] === "boolean"
          ? Boolean(
              (planRow?.limits as { features?: Record<string, unknown> } | undefined)?.features?.[
                key
              ],
            )
          : true;
      const override = overrideMap.has(key) ? Boolean(overrideMap.get(key)) : null;
      return {
        key,
        label: ENTITLEMENT_LABELS[key],
        planDefault,
        override,
        effective: override === null ? planDefault : override,
      };
    });

    return jsonSuccess({ organisationId: id, planKey, features });
  } catch (err) {
    return handleApiError(err, "Failed to fetch organisation feature overrides", {
      route: "GET /api/admin/organisations/[id]/features",
    });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const { id } = await params;
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const { body, errorResponse } = await parseJsonBody(
      request,
      "PATCH /api/admin/organisations/[id]/features",
    );
    if (errorResponse) return errorResponse;

    const parsed = adminOrgFeatureOverrideSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const admin = createSupabaseAdmin();
    const { error } = await admin.from("organisation_feature_overrides").upsert(
      {
        organisation_id: id,
        feature_key: parsed.data.featureKey,
        enabled: parsed.data.enabled,
        reason: parsed.data.reason ?? null,
        updated_by: ctx.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organisation_id,feature_key" },
    );
    if (error) return jsonError("Failed to save organisation feature override", 500);

    await invalidateOrganisationEntitlement(id, parsed.data.featureKey);
    return jsonSuccess({ ok: true });
  } catch (err) {
    return handleApiError(err, "Failed to update organisation feature override", {
      route: "PATCH /api/admin/organisations/[id]/features",
    });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const { id } = await params;
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const { body, errorResponse } = await parseJsonBody(
      request,
      "DELETE /api/admin/organisations/[id]/features",
    );
    if (errorResponse) return errorResponse;
    const parsed = adminOrgFeatureOverrideDeleteSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const admin = createSupabaseAdmin();
    const { error } = await admin
      .from("organisation_feature_overrides")
      .delete()
      .eq("organisation_id", id)
      .eq("feature_key", parsed.data.featureKey);
    if (error) return jsonError("Failed to clear organisation feature override", 500);

    await invalidateOrganisationEntitlement(id, parsed.data.featureKey);
    return jsonSuccess({ ok: true });
  } catch (err) {
    return handleApiError(err, "Failed to clear organisation feature override", {
      route: "DELETE /api/admin/organisations/[id]/features",
    });
  }
}

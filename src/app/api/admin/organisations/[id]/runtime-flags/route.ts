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
  adminOrgRuntimeFlagOverrideDeleteSchema,
  adminOrgRuntimeFlagOverrideSchema,
} from "@/lib/validations/organisations";
import { validateOrigin } from "@/lib/security/csrf";
import { invalidateFeatureFlagCache } from "@/lib/feature-flags";

type RuntimeFlagState = {
  key: string;
  description: string | null;
  globalDefault: boolean;
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
    const [{ data: org }, { data: globalFlags }, { data: overrideRows }] = await Promise.all([
      admin.from("organisations").select("id").eq("id", id).maybeSingle(),
      admin
        .from("feature_flags")
        .select("key, enabled, description")
        .order("key", { ascending: true }),
      admin
        .from("organisation_runtime_feature_flag_overrides")
        .select("flag_key, enabled")
        .eq("organisation_id", id),
    ]);

    if (!org) return jsonError("Organisation not found", 404);

    const overrideMap = new Map<string, boolean>();
    for (const row of overrideRows ?? []) {
      overrideMap.set(String(row.flag_key), Boolean(row.enabled));
    }

    const flags: RuntimeFlagState[] = (globalFlags ?? []).map((row) => {
      const key = String(row.key);
      const globalDefault = Boolean(row.enabled);
      const override = overrideMap.has(key) ? Boolean(overrideMap.get(key)) : null;
      return {
        key,
        description: row.description ?? null,
        globalDefault,
        override,
        effective: override === null ? globalDefault : override,
      };
    });

    return jsonSuccess({ organisationId: id, flags });
  } catch (err) {
    return handleApiError(err, "Failed to fetch organisation runtime flags", {
      route: "GET /api/admin/organisations/[id]/runtime-flags",
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
      "PATCH /api/admin/organisations/[id]/runtime-flags",
    );
    if (errorResponse) return errorResponse;

    const parsed = adminOrgRuntimeFlagOverrideSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const admin = createSupabaseAdmin();
    const { data: globalFlag } = await admin
      .from("feature_flags")
      .select("key")
      .eq("key", parsed.data.flagKey)
      .maybeSingle();
    if (!globalFlag) return jsonError("Feature flag key not found", 404);

    const { error } = await admin.from("organisation_runtime_feature_flag_overrides").upsert(
      {
        organisation_id: id,
        flag_key: parsed.data.flagKey,
        enabled: parsed.data.enabled,
        reason: parsed.data.reason ?? null,
        updated_by: ctx.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organisation_id,flag_key" },
    );
    if (error) return jsonError("Failed to save organisation runtime flag override", 500);

    await invalidateFeatureFlagCache(parsed.data.flagKey, id);
    return jsonSuccess({ ok: true });
  } catch (err) {
    return handleApiError(err, "Failed to update organisation runtime flag override", {
      route: "PATCH /api/admin/organisations/[id]/runtime-flags",
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
      "DELETE /api/admin/organisations/[id]/runtime-flags",
    );
    if (errorResponse) return errorResponse;

    const parsed = adminOrgRuntimeFlagOverrideDeleteSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const admin = createSupabaseAdmin();
    const { error } = await admin
      .from("organisation_runtime_feature_flag_overrides")
      .delete()
      .eq("organisation_id", id)
      .eq("flag_key", parsed.data.flagKey);
    if (error) return jsonError("Failed to clear organisation runtime flag override", 500);

    await invalidateFeatureFlagCache(parsed.data.flagKey, id);
    return jsonSuccess({ ok: true });
  } catch (err) {
    return handleApiError(err, "Failed to clear organisation runtime flag override", {
      route: "DELETE /api/admin/organisations/[id]/runtime-flags",
    });
  }
}

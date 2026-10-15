import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
} from "@/lib/api-helpers";
import { clearFlagCache, invalidateFeatureFlagCache } from "@/lib/feature-flags";
import { mergeCatalogOntoFlagRow, sortFlagRowsForAdmin } from "@/lib/feature-flags/catalog";
import { validateOrigin } from "@/lib/security/csrf";

/**
 * GET /api/admin/feature-flags
 * List all feature flags. Super_admin only.
 */
export async function GET() {
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("feature_flags")
    .select("key, enabled, description, updated_at")
    .order("key");

  if (error) return jsonError("Failed to fetch feature flags", 500);
  const enriched = sortFlagRowsForAdmin((data ?? []).map((row) => mergeCatalogOntoFlagRow(row)));
  return jsonSuccess({ flags: enriched });
}

/**
 * PATCH /api/admin/feature-flags
 * Update a feature flag. Body: { key: string, enabled: boolean }. Super_admin only.
 */
export async function PATCH(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

  const { body, errorResponse } = await parseJsonBody(request, "PATCH /api/admin/feature-flags");
  if (errorResponse) return errorResponse;

  if (
    !body ||
    typeof (body as Record<string, unknown>).key !== "string" ||
    typeof (body as Record<string, unknown>).enabled !== "boolean"
  ) {
    return jsonError("Body must include key (string) and enabled (boolean)", 400);
  }

  const { key, enabled } = body as { key: string; enabled: boolean };
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("feature_flags")
    .update({
      enabled,
      updated_by: ctx.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("key", key);

  if (error) return jsonError("Failed to update feature flag", 500);

  clearFlagCache();
  await invalidateFeatureFlagCache(key);
  return jsonSuccess({ key, enabled });
}

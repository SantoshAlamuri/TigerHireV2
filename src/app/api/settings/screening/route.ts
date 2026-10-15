import { NextRequest } from "next/server";
import {
  getAuthContext,
  handleApiError,
  handleZodError,
  jsonError,
  jsonSuccess,
  parseJsonBody,
  requireAuth,
  hasRole,
} from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { patchScreeningSettingsSchema } from "@/lib/validations/screening";
import { validateOrigin } from "@/lib/security/csrf";
import { getTenantScopedClient } from "@/lib/api-helpers";

const SETTINGS_COLUMNS = [
  "screening_default_mode",
  "voice_screening_enabled",
  "voice_screening_free_credits_per_month",
  "voice_screening_monthly_cap_inr",
  "screening_fitscore_threshold",
  "screening_calling_hours_start",
  "screening_calling_hours_end",
  "screening_auto_trigger",
  "notetaker_enabled",
  "notetaker_monthly_cap_inr",
].join(", ");

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const ctx = await getAuthContext(supabase);
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId && ctx.role !== "super_admin") return jsonError("Forbidden", 403);

    const query = supabase.from("organisations").select(SETTINGS_COLUMNS);
    const scoped =
      ctx.role === "super_admin" ? query.limit(1) : query.eq("id", ctx.organisationId).single();
    const { data, error } = await scoped;
    if (error) throw error;
    const settings = Array.isArray(data) ? data[0] : data;
    return jsonSuccess({ settings });
  } catch (error) {
    return handleApiError(error, "Failed to load screening settings", {
      route: "GET /api/settings/screening",
    });
  }
}

export async function PATCH(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const supabase = await createSupabaseServerClient();
    const ctx = await getAuthContext(supabase);
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "recruiter", "leadership", "super_admin")) return jsonError("Forbidden", 403);
    if (!ctx.organisationId && ctx.role !== "super_admin") return jsonError("Forbidden", 403);

    const parsedBody = await parseJsonBody<unknown>(request, "PATCH /api/settings/screening");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = patchScreeningSettingsSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);
    if (Object.keys(parsed.data).length === 0) {
      return jsonError("No settings provided", 400);
    }

    const db = await getTenantScopedClient(ctx);
    const orgId = ctx.organisationId;
    if (!orgId) return jsonError("Forbidden", 403);

    const { data, error } = await db
      .organisations()
      .update(parsed.data)
      .eq("id", orgId)
      .select(SETTINGS_COLUMNS)
      .single();
    if (error) throw error;
    return jsonSuccess({ settings: data });
  } catch (error) {
    return handleApiError(error, "Failed to update screening settings", {
      route: "PATCH /api/settings/screening",
    });
  }
}

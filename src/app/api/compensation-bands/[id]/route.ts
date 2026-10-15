import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
  handleZodError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import {
  buildScopedRateLimitKey,
  checkRateLimit,
  RATE_LIMIT_PRESETS,
} from "@/lib/security/rate-limit";
import { patchCompensationBandSchema } from "@/lib/validations/compensation-bands";
import { getOrganisationEntitlement } from "@/lib/entitlements";

function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const { id } = await params;
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);

    if (!ctx.isOrgAdmin && ctx.role !== "super_admin") {
      return jsonError("Forbidden", 403);
    }

    const ent = await getOrganisationEntitlement(ctx.organisationId, "compensation_bands");
    if (!ent.allowed)
      return jsonError("Compensation bands are not enabled for your organisation", 403);

    const rl = await checkRateLimit({
      key: buildScopedRateLimitKey({
        route: "compensation-bands-patch",
        organisationId: ctx.organisationId,
        userId: ctx.userId,
        suffix: clientIp(request),
      }),
      ...RATE_LIMIT_PRESETS.default,
    });
    if (!rl.allowed) return jsonError("Too many attempts, please try again shortly", 429);

    const { body, errorResponse } = await parseJsonBody(
      request,
      "PATCH /api/compensation-bands/[id]",
    );
    if (errorResponse) return errorResponse;
    const parsed = patchCompensationBandSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const admin = createSupabaseAdmin();
    const { data: existing, error: loadErr } = await admin
      .from("compensation_bands")
      .select("id, min_amount, max_amount")
      .eq("id", id)
      .eq("organisation_id", ctx.organisationId)
      .maybeSingle();
    if (loadErr || !existing) return jsonError("Band not found", 404);

    const nextMin = parsed.data.minAmount ?? Number(existing.min_amount);
    const nextMax = parsed.data.maxAmount ?? Number(existing.max_amount);
    if (nextMin >= nextMax) {
      return jsonError("minAmount must be less than maxAmount", 422);
    }

    const patch: Record<string, unknown> = {};
    if (parsed.data.label !== undefined) patch.label = parsed.data.label.trim();
    if (parsed.data.currency !== undefined) patch.currency = parsed.data.currency.toUpperCase();
    if (parsed.data.minAmount !== undefined) patch.min_amount = parsed.data.minAmount;
    if (parsed.data.maxAmount !== undefined) patch.max_amount = parsed.data.maxAmount;
    if (parsed.data.isActive !== undefined) patch.is_active = parsed.data.isActive;

    if (Object.keys(patch).length === 0) {
      return jsonError("No fields to update", 400);
    }

    const { data: row, error } = await admin
      .from("compensation_bands")
      .update(patch)
      .eq("id", id)
      .eq("organisation_id", ctx.organisationId)
      .select(
        "id, organisation_id, label, currency, min_amount, max_amount, is_active, created_at, updated_at",
      )
      .single();

    if (error || !row) return jsonError(error?.message ?? "Failed to update band", 500);
    return jsonSuccess({ band: row });
  } catch (err) {
    return handleApiError(err, "Failed to update compensation band", {
      route: "PATCH /api/compensation-bands/[id]",
    });
  }
}

/**
 * DELETE — soft delete (is_active = false).
 */
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
    if (!ctx.organisationId) return jsonError("No organisation context", 400);

    if (!ctx.isOrgAdmin && ctx.role !== "super_admin") {
      return jsonError("Forbidden", 403);
    }

    const ent = await getOrganisationEntitlement(ctx.organisationId, "compensation_bands");
    if (!ent.allowed)
      return jsonError("Compensation bands are not enabled for your organisation", 403);

    const rl = await checkRateLimit({
      key: buildScopedRateLimitKey({
        route: "compensation-bands-delete",
        organisationId: ctx.organisationId,
        userId: ctx.userId,
        suffix: clientIp(request),
      }),
      ...RATE_LIMIT_PRESETS.default,
    });
    if (!rl.allowed) return jsonError("Too many attempts, please try again shortly", 429);

    const admin = createSupabaseAdmin();
    const { data: row, error } = await admin
      .from("compensation_bands")
      .update({ is_active: false })
      .eq("id", id)
      .eq("organisation_id", ctx.organisationId)
      .select(
        "id, organisation_id, label, currency, min_amount, max_amount, is_active, created_at, updated_at",
      )
      .single();

    if (error || !row) return jsonError("Band not found", 404);
    return jsonSuccess({ band: row });
  } catch (err) {
    return handleApiError(err, "Failed to deactivate compensation band", {
      route: "DELETE /api/compensation-bands/[id]",
    });
  }
}

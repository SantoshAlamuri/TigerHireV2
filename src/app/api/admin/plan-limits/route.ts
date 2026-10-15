import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { z } from "zod";
import { validateOrigin } from "@/lib/security/csrf";
import { ENTITLEMENT_FEATURE_KEYS, type EntitlementFeatureKey } from "@/lib/entitlements/config";

const featuresSchema = z
  .object(
    Object.fromEntries(ENTITLEMENT_FEATURE_KEYS.map((key) => [key, z.boolean()])) as Record<
      EntitlementFeatureKey,
      z.ZodBoolean
    >,
  )
  .strict();

const updateLimitsSchema = z
  .object({
    plan_key: z.string().min(1),
    plan_type: z.literal("company"),
    limits: z
      .object({
        unlocks: z.number().int().min(-1),
        features: featuresSchema,
      })
      .strict(),
  })
  .strict();

/**
 * GET /api/admin/plan-limits — list billing_plans (company plans with limits). Super_admin only.
 * Used by admin UI to view and edit plan slabs; limits are applied automatically (no human step).
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("billing_plans")
      .select(
        "id, plan_key, plan_type, name, limits, stripe_price_id, razorpay_plan_id, updated_at",
      )
      .eq("plan_type", "company")
      .order("plan_key");

    if (error) return jsonError("Failed to fetch plan limits", 500);
    return jsonSuccess({ plans: data ?? [] });
  } catch (err) {
    return handleApiError(err, "Failed to fetch plan limits", {
      route: "GET /api/admin/plan-limits",
    });
  }
}

/**
 * PATCH /api/admin/plan-limits — update limits for a plan. Super_admin only.
 * Body: { plan_key, plan_type: "company", limits: { unlocks } }
 */
export async function PATCH(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const parsedBody = await parseJsonBody(request, "PATCH /api/admin/plan-limits");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = updateLimitsSchema.safeParse(parsedBody.body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues.map((i) => i.message).join("; ") || "Invalid body", 400);
    }

    const { plan_key, plan_type, limits } = parsed.data;
    const admin = createSupabaseAdmin();

    const { data, error } = await admin
      .from("billing_plans")
      .update({
        limits,
        updated_at: new Date().toISOString(),
      })
      .eq("plan_key", plan_key)
      .eq("plan_type", plan_type)
      .select(
        "id, plan_key, plan_type, name, limits, stripe_price_id, razorpay_plan_id, updated_at",
      )
      .single();

    if (error) return jsonError("Failed to update plan limits", 500);
    return jsonSuccess({ plan: data });
  } catch (err) {
    return handleApiError(err, "Failed to update plan limits", {
      route: "PATCH /api/admin/plan-limits",
    });
  }
}

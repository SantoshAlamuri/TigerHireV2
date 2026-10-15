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
import { hasAnyEnterpriseRole } from "@/lib/security/enterprise-roles";
import { validateOrigin } from "@/lib/security/csrf";
import {
  buildScopedRateLimitKey,
  checkRateLimit,
  RATE_LIMIT_PRESETS,
} from "@/lib/security/rate-limit";
import { createCompensationBandSchema } from "@/lib/validations/compensation-bands";
import { getOrganisationEntitlement } from "@/lib/entitlements";

function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/**
 * GET /api/compensation-bands — active bands (default), or all with ?all=1 for settings UI.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);

    const supabase = await createSupabaseServerClient();
    const allowed = await hasAnyEnterpriseRole(
      ctx.userId,
      ["leadership", "recruiter", "super_admin"],
      supabase,
    );
    if (!allowed) return jsonError("Forbidden", 403);

    const ent = await getOrganisationEntitlement(ctx.organisationId, "compensation_bands");
    if (!ent.allowed) return jsonSuccess({ bands: [] });

    const { searchParams } = new URL(request.url);
    const all = searchParams.get("all") === "1";

    let q = supabase
      .from("compensation_bands")
      .select(
        "id, organisation_id, label, currency, min_amount, max_amount, is_active, created_at, updated_at",
      )
      .eq("organisation_id", ctx.organisationId)
      .order("label", { ascending: true });
    if (!all) {
      q = q.eq("is_active", true);
    }

    const { data, error } = await q;
    if (error) return jsonError("Failed to load compensation bands", 500);
    return jsonSuccess({ bands: data ?? [] });
  } catch (err) {
    return handleApiError(err, "Failed to list compensation bands", {
      route: "GET /api/compensation-bands",
    });
  }
}

/**
 * POST /api/compensation-bands — create (leadership only).
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);

    const supabase = await createSupabaseServerClient();
    if (!ctx.isOrgAdmin && ctx.role !== "super_admin") {
      return jsonError("Forbidden", 403);
    }

    const ent = await getOrganisationEntitlement(ctx.organisationId, "compensation_bands");
    if (!ent.allowed)
      return jsonError("Compensation bands are not enabled for your organisation", 403);

    const rl = await checkRateLimit({
      key: buildScopedRateLimitKey({
        route: "compensation-bands-create",
        organisationId: ctx.organisationId,
        userId: ctx.userId,
        suffix: clientIp(request),
      }),
      ...RATE_LIMIT_PRESETS.default,
    });
    if (!rl.allowed) return jsonError("Too many attempts, please try again shortly", 429);

    const { body, errorResponse } = await parseJsonBody(request, "POST /api/compensation-bands");
    if (errorResponse) return errorResponse;
    const parsed = createCompensationBandSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);
    if (parsed.data.minAmount >= parsed.data.maxAmount) {
      return jsonError("minAmount must be less than maxAmount", 422);
    }

    const admin = createSupabaseAdmin();
    const { data: row, error } = await admin
      .from("compensation_bands")
      .insert({
        organisation_id: ctx.organisationId,
        label: parsed.data.label.trim(),
        currency: parsed.data.currency,
        min_amount: parsed.data.minAmount,
        max_amount: parsed.data.maxAmount,
        is_active: true,
      })
      .select(
        "id, organisation_id, label, currency, min_amount, max_amount, is_active, created_at, updated_at",
      )
      .single();

    if (error || !row) return jsonError(error?.message ?? "Failed to create band", 500);
    return jsonSuccess({ band: row }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to create compensation band", {
      route: "POST /api/compensation-bands",
    });
  }
}

import { z } from "zod";
import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
  handleZodError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";

const planLineSchema = z
  .object({
    department: z.string().max(120).optional().nullable(),
    roleLevel: z.string().max(120).optional().nullable(),
    costCenter: z.string().max(120).optional().nullable(),
    locationCity: z.string().max(120).optional().nullable(),
    headcountLimit: z.number().int().min(1).default(1),
    approvedBudgetMin: z.number().nonnegative().optional().nullable(),
    approvedBudgetMax: z.number().nonnegative().optional().nullable(),
    currency: z.string().max(10).default("INR"),
  })
  .strict();

const createPlanSchema = z
  .object({
    planCode: z.string().trim().min(2).max(60),
    title: z.string().trim().min(2).max(200),
    fiscalYear: z.number().int().min(2020).max(2100),
    sourceSystem: z.string().trim().max(100).optional().nullable(),
    sourceRef: z.string().trim().max(120).optional().nullable(),
    lines: z.array(planLineSchema).min(1).max(500),
  })
  .strict();

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);
    if (!hasRole(ctx, "hiring_manager", "recruiter", "leadership", "super_admin", "finance")) {
      return jsonError("Forbidden", 403);
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("headcount_plans")
      .select("*, lines:headcount_plan_lines(*)")
      .eq("organisation_id", ctx.organisationId)
      .eq("status", "approved")
      .order("fiscal_year", { ascending: false })
      .limit(20);
    if (error) throw error;

    return jsonSuccess({ plans: data ?? [] });
  } catch (err) {
    return handleApiError(err, "Failed to load headcount plans", {
      route: "GET /api/headcount-plans",
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
    if (!hasRole(ctx, "leadership", "super_admin", "finance")) return jsonError("Forbidden", 403);

    const parsedBody = await parseJsonBody(request, "POST /api/headcount-plans");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = createPlanSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);
    const payload = parsed.data;

    const supabase = await createSupabaseServerClient();
    const nowIso = new Date().toISOString();
    const { data: plan, error: planErr } = await supabase
      .from("headcount_plans")
      .insert({
        organisation_id: ctx.organisationId,
        plan_code: payload.planCode,
        title: payload.title,
        fiscal_year: payload.fiscalYear,
        status: "approved",
        source_system: payload.sourceSystem ?? null,
        source_ref: payload.sourceRef ?? null,
        synced_at: nowIso,
        created_by: ctx.userId,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("id")
      .single();
    if (planErr || !plan) throw planErr ?? new Error("Failed to create plan");

    const rows = payload.lines.map((line) => ({
      organisation_id: ctx.organisationId,
      plan_id: plan.id,
      department: line.department ?? null,
      role_level: line.roleLevel ?? null,
      cost_center: line.costCenter ?? null,
      location_city: line.locationCity ?? null,
      headcount_limit: line.headcountLimit,
      approved_budget_min: line.approvedBudgetMin ?? null,
      approved_budget_max: line.approvedBudgetMax ?? null,
      currency: line.currency,
      updated_at: nowIso,
    }));
    const { error: linesErr } = await supabase.from("headcount_plan_lines").insert(rows);
    if (linesErr) throw linesErr;

    const { data: withLines } = await supabase
      .from("headcount_plans")
      .select("*, lines:headcount_plan_lines(*)")
      .eq("id", plan.id)
      .maybeSingle();
    return jsonSuccess({ plan: withLines }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to save headcount plan", {
      route: "POST /api/headcount-plans",
    });
  }
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";

export type HeadcountPlanSyncLineInput = {
  department?: string | null;
  roleLevel?: string | null;
  costCenter?: string | null;
  locationCity?: string | null;
  headcountLimit?: number | null;
  approvedBudgetMin?: number | null;
  approvedBudgetMax?: number | null;
  currency?: string | null;
};

export type HeadcountPlanSyncInput = {
  organisationId: string;
  actorProfileId: string;
  planCode: string;
  title: string;
  fiscalYear: number;
  sourceSystem?: string | null;
  sourceRef?: string | null;
  lines: HeadcountPlanSyncLineInput[];
};

/**
 * Upserts one approved headcount plan + its line items as a read-model for requisition checks.
 * This is the ingestion target used by API/manual sync and future HRMS connectors.
 */
export async function upsertApprovedHeadcountPlan(
  admin: SupabaseClient,
  input: HeadcountPlanSyncInput,
): Promise<{ planId: string; lineCount: number }> {
  const nowIso = new Date().toISOString();

  const { data: existing, error: existingErr } = await admin
    .from("headcount_plans")
    .select("id")
    .eq("organisation_id", input.organisationId)
    .eq("plan_code", input.planCode)
    .eq("fiscal_year", input.fiscalYear)
    .maybeSingle();
  if (existingErr) throw existingErr;

  const { data: upserted, error: upsertErr } = await admin
    .from("headcount_plans")
    .upsert(
      {
        id: existing?.id ?? undefined,
        organisation_id: input.organisationId,
        plan_code: input.planCode,
        title: input.title,
        fiscal_year: input.fiscalYear,
        status: "approved",
        source_system: input.sourceSystem ?? null,
        source_ref: input.sourceRef ?? null,
        synced_at: nowIso,
        created_by: input.actorProfileId,
        updated_at: nowIso,
      },
      { onConflict: "organisation_id,plan_code,fiscal_year" },
    )
    .select("id")
    .single();
  if (upsertErr || !upserted?.id) throw upsertErr ?? new Error("Failed to upsert headcount plan");

  const planId = upserted.id as string;

  const { error: clearErr } = await admin
    .from("headcount_plan_lines")
    .delete()
    .eq("organisation_id", input.organisationId)
    .eq("plan_id", planId);
  if (clearErr) throw clearErr;

  const normalizedLines = input.lines.map((line) => ({
    organisation_id: input.organisationId,
    plan_id: planId,
    department: line.department ?? null,
    role_level: line.roleLevel ?? null,
    cost_center: line.costCenter ?? null,
    location_city: line.locationCity ?? null,
    headcount_limit: Math.max(1, Number(line.headcountLimit ?? 1)),
    approved_budget_min: line.approvedBudgetMin ?? null,
    approved_budget_max: line.approvedBudgetMax ?? null,
    currency: (line.currency ?? "INR").toUpperCase(),
    updated_at: nowIso,
  }));

  if (normalizedLines.length > 0) {
    const { error: linesErr } = await admin.from("headcount_plan_lines").insert(normalizedLines);
    if (linesErr) throw linesErr;
  }

  logger.info("Headcount plan sync upserted", {
    organisationId: input.organisationId,
    planId,
    lines: normalizedLines.length,
    sourceSystem: input.sourceSystem ?? null,
  });
  return { planId, lineCount: normalizedLines.length };
}

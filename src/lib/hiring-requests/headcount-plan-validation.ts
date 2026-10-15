import type { SupabaseClient } from "@supabase/supabase-js";

export type HeadcountPlanValidationResult =
  | { ok: true; lineId: string | null }
  | { ok: false; error: string };

export async function validateHiringRequestAgainstHeadcountPlan(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    department: string | null;
    roleLevel: string | null;
    costCenter: string | null;
    locationCity: string | null;
    budgetCtcMin: number | null;
    budgetCtcMax: number | null;
    requestedHeadcount: number;
  },
): Promise<HeadcountPlanValidationResult> {
  const { data: lines, error } = await supabase
    .from("headcount_plan_lines")
    .select(
      "id, department, role_level, cost_center, location_city, headcount_limit, approved_budget_min, approved_budget_max, plan:headcount_plans!inner(status)",
    )
    .eq("organisation_id", params.organisationId)
    .eq("headcount_plans.status", "approved")
    .limit(200);

  if (error) {
    return { ok: false, error: "Could not validate approved headcount plan for this requisition" };
  }
  if (!lines || lines.length === 0) {
    return { ok: true, lineId: null };
  }
  const normalized = (lines ?? []).find((line) => {
    const deptMatch = !line.department || line.department === params.department;
    const levelMatch = !line.role_level || line.role_level === params.roleLevel;
    const ccMatch = !line.cost_center || line.cost_center === params.costCenter;
    const cityMatch = !line.location_city || line.location_city === params.locationCity;
    return deptMatch && levelMatch && ccMatch && cityMatch;
  });

  if (!normalized) {
    return { ok: false, error: "No approved headcount plan line matches this requisition" };
  }

  if (params.requestedHeadcount > Number(normalized.headcount_limit ?? 1)) {
    return {
      ok: false,
      error: `Requested headcount exceeds approved limit (${String(normalized.headcount_limit)})`,
    };
  }
  const approvedMin =
    normalized.approved_budget_min == null ? null : Number(normalized.approved_budget_min);
  const approvedMax =
    normalized.approved_budget_max == null ? null : Number(normalized.approved_budget_max);
  const min = params.budgetCtcMin;
  const max = params.budgetCtcMax;
  if (approvedMin != null && min != null && min < approvedMin) {
    return { ok: false, error: `Budget minimum is below approved plan minimum (${approvedMin})` };
  }
  if (approvedMax != null && max != null && max > approvedMax) {
    return { ok: false, error: `Budget maximum exceeds approved plan maximum (${approvedMax})` };
  }

  return { ok: true, lineId: normalized.id as string };
}

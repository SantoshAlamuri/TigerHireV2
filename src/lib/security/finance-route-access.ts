import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@/types/database";

/** Profile roles that may open /company/finance without an employee_roles row. */
const FINANCE_ROUTE_PROFILE_ROLES: UserRole[] = ["finance", "leadership", "super_admin"];

/** Enterprise / employee_roles values that grant finance inbox (aligned with hasAnyEnterpriseRole checks). */
const FINANCE_ROUTE_ENTERPRISE_ROLES = new Set<string>(["finance", "leadership", "super_admin"]);

/**
 * Edge/middleware-safe: uses the Supabase client from `updateSession` only (no `next/headers`).
 * Recruiters and hiring managers need a matching enterprise role row; others use primary profile role.
 */
export async function canAccessCompanyFinanceRoute(
  userId: string,
  profileRole: UserRole,
  supabase: SupabaseClient,
): Promise<boolean> {
  if (FINANCE_ROUTE_PROFILE_ROLES.includes(profileRole)) return true;
  if (profileRole !== "recruiter" && profileRole !== "hiring_manager") return false;

  const { data: rows, error } = await supabase
    .from("employee_roles")
    .select("role")
    .eq("employee_id", userId);

  if (error || !rows?.length) return false;
  return rows.some((r: { role: string }) => FINANCE_ROUTE_ENTERPRISE_ROLES.has(r.role));
}

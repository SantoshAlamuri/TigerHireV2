import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types";

export type EnterpriseRole = UserRole | "interviewer" | "finance";

interface ProfileRoleRow {
  role: UserRole;
}

interface EmployeeRoleRow {
  role: EnterpriseRole;
}

export async function getActiveRoles(
  userId: string,
  existingClient?: SupabaseClient,
): Promise<Set<EnterpriseRole>> {
  const supabase = existingClient ?? (await createSupabaseServerClient());

  const [profileRes, employeeRolesRes] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", userId).single(),
    supabase.from("employee_roles").select("role").eq("employee_id", userId),
  ]);

  const roles = new Set<EnterpriseRole>();
  const profile = profileRes.data as ProfileRoleRow | null;
  if (profile?.role) roles.add(profile.role);

  for (const row of (employeeRolesRes.data ?? []) as EmployeeRoleRow[]) {
    if (row.role) roles.add(row.role);
  }
  return roles;
}

export async function hasAnyEnterpriseRole(
  userId: string,
  roles: EnterpriseRole[],
  existingClient?: SupabaseClient,
): Promise<boolean> {
  const activeRoles = await getActiveRoles(userId, existingClient);
  return roles.some((role) => activeRoles.has(role));
}

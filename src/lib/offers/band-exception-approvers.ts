import type { SupabaseClient } from "@supabase/supabase-js";
import type { SettingsPermissions } from "@/lib/settings/permissions";

/**
 * B7: comp exception emails go to configured profile IDs, or finance approvers if unset.
 */
export async function resolveBandExceptionApproverIds(
  admin: SupabaseClient,
  organisationId: string,
  permissions: SettingsPermissions,
): Promise<string[]> {
  const configured = (permissions.compApproverProfileIds ?? []).filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  if (configured.length > 0) return [...new Set(configured)];

  const { data: financeUsers } = await admin
    .from("employee_roles")
    .select("employee_id, profiles!inner(organisation_id)")
    .eq("role", "finance")
    .eq("profiles.organisation_id", organisationId);

  return (financeUsers ?? []).map((row: { employee_id: string }) => row.employee_id);
}

export async function canActorApproveBandException(
  admin: SupabaseClient,
  organisationId: string,
  approverProfileId: string,
  permissions: SettingsPermissions,
): Promise<boolean> {
  const { data: profile } = await admin
    .from("profiles")
    .select("role, organisation_id")
    .eq("id", approverProfileId)
    .maybeSingle();
  if (!profile) return false;
  if (profile.role === "super_admin") return true;
  if (profile.organisation_id !== organisationId) return false;
  if (profile.role === "leadership") return true;
  const ids = await resolveBandExceptionApproverIds(admin, organisationId, permissions);
  return ids.includes(approverProfileId);
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasAnyEnterpriseRole } from "@/lib/security/enterprise-roles";

export function isMissingDelegationsTableError(error: unknown): boolean {
  const code = String((error as { code?: string } | null)?.code ?? "");
  const message = String((error as { message?: string } | null)?.message ?? "");
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    message.includes("approval_delegations") ||
    message.includes("schema cache")
  );
}

async function hasActiveDelegationForRole(
  admin: SupabaseClient,
  params: { organisationId: string; role: string; delegateProfileId: string },
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const { data: delegated, error } = await admin
    .from("approval_delegations")
    .select("id")
    .eq("organisation_id", params.organisationId)
    .eq("delegate_profile_id", params.delegateProfileId)
    .eq("approver_role", params.role)
    .is("revoked_at", null)
    .lte("starts_at", nowIso)
    .gte("ends_at", nowIso)
    .limit(1);
  if (error) {
    if (isMissingDelegationsTableError(error)) return false;
    throw error;
  }
  return Boolean(delegated && delegated.length > 0);
}

export async function canActorApproveRequiredRole(
  admin: SupabaseClient,
  params: { organisationId: string; actorProfileId: string; requiredRole: string | null },
): Promise<boolean> {
  if (!params.requiredRole) return true;
  const { data: actor } = await admin
    .from("profiles")
    .select("role, organisation_id")
    .eq("id", params.actorProfileId)
    .maybeSingle();
  if (!actor) return false;
  if (actor.role === "super_admin") return true;
  if (actor.organisation_id !== params.organisationId) return false;
  if (actor.role === params.requiredRole) return true;

  if (params.requiredRole === "finance") {
    const hasFinanceCapability = await hasAnyEnterpriseRole(
      params.actorProfileId,
      ["finance", "leadership", "super_admin"],
      admin,
    );
    if (hasFinanceCapability) return true;
  }

  return hasActiveDelegationForRole(admin, {
    organisationId: params.organisationId,
    role: params.requiredRole,
    delegateProfileId: params.actorProfileId,
  });
}

export async function listApproverProfileIdsForRole(
  admin: SupabaseClient,
  params: { organisationId: string; role: string },
): Promise<string[]> {
  const ids = new Set<string>();
  const { data: primaryProfiles } = await admin
    .from("profiles")
    .select("id")
    .eq("organisation_id", params.organisationId)
    .eq("role", params.role);
  for (const profile of primaryProfiles ?? []) {
    if (profile.id) ids.add(String(profile.id));
  }

  if (params.role === "finance") {
    const { data: enterpriseRoles } = await admin
      .from("employee_roles")
      .select("employee_id, profiles!inner(organisation_id)")
      .eq("role", "finance")
      .eq("profiles.organisation_id", params.organisationId);
    for (const row of enterpriseRoles ?? []) {
      const employeeId = String((row as { employee_id?: string }).employee_id ?? "");
      if (employeeId) ids.add(employeeId);
    }
  }

  return [...ids];
}

export async function hasActiveApproverForRole(
  admin: SupabaseClient,
  params: { organisationId: string; role: string },
): Promise<boolean> {
  const direct = await listApproverProfileIdsForRole(admin, params);
  if (direct.length > 0) return true;

  const nowIso = new Date().toISOString();
  const { data: delegatedApprovers, error } = await admin
    .from("approval_delegations")
    .select("id")
    .eq("organisation_id", params.organisationId)
    .eq("approver_role", params.role)
    .is("revoked_at", null)
    .lte("starts_at", nowIso)
    .gte("ends_at", nowIso)
    .limit(1);
  if (error) {
    if (isMissingDelegationsTableError(error)) return false;
    throw error;
  }
  return (delegatedApprovers ?? []).length > 0;
}

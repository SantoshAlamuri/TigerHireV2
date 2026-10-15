import type { UserRole } from "@/types";

/**
 * Tenant context that must be provided for all tenant-scoped operations.
 * This ensures tenant isolation is enforced at the type level.
 */
export interface TenantContext {
  /** User's organisation ID - null for super_admin without org */
  organisationId: string | null;
  /** User's role */
  role: UserRole;
  /** User ID */
  userId: string;
  /** For agency users, includes client organisation IDs */
  accessibleOrganisationIds: string[];
  /** Whether user is super_admin (can bypass tenant checks) */
  isSuperAdmin: boolean;
}

/**
 * Resolve accessible organisation IDs for a user.
 * For agency users, includes their own org + client orgs.
 * For others, just their own org.
 */
export async function resolveAccessibleOrganisationIds(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createSupabaseServerClient>>,
  organisationId: string | null,
  role: UserRole,
): Promise<string[]> {
  if (!organisationId) return [];

  if (role === "agency") {
    const { data: links } = await supabase
      .from("agency_clients")
      .select("client_organisation_id")
      .eq("agency_organisation_id", organisationId);
    const clientIds = (links ?? []).map(
      (r: { client_organisation_id: string }) => r.client_organisation_id,
    );
    return [...new Set([organisationId, ...clientIds])];
  }

  return [organisationId];
}

/**
 * Create tenant context from auth context.
 * This should be called at the start of every API route.
 */
export async function createTenantContext(authContext: {
  userId: string;
  role: UserRole;
  organisationId: string | null;
}): Promise<TenantContext> {
  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = await createSupabaseServerClient();

  const accessibleOrganisationIds = await resolveAccessibleOrganisationIds(
    supabase,
    authContext.organisationId,
    authContext.role,
  );

  return {
    organisationId: authContext.organisationId,
    role: authContext.role,
    userId: authContext.userId,
    accessibleOrganisationIds,
    isSuperAdmin: authContext.role === "super_admin",
  };
}

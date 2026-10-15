import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenantContext } from "./tenant-context";

type InEqCapable = {
  in: (column: string, values: readonly string[]) => unknown;
  eq: (column: string, value: string) => unknown;
};

function applyIn<T>(query: T, column: string, values: readonly string[]): T {
  return (query as unknown as InEqCapable).in(column, values) as T;
}

function applyEq<T>(query: T, column: string, value: string): T {
  return (query as unknown as InEqCapable).eq(column, value) as T;
}

/**
 * Helper to add organisation filter to a query.
 * Automatically handles super_admin (no filter) and agency (multiple orgs).
 */
export function addOrganisationFilter<T>(
  query: ReturnType<SupabaseClient["from"]>,
  tenantContext: TenantContext,
  organisationIdColumn: string = "organisation_id",
): ReturnType<SupabaseClient["from"]> {
  if (tenantContext.isSuperAdmin) {
    return query;
  }

  if (tenantContext.accessibleOrganisationIds.length === 0) {
    // Return a query that will return no results
    return applyEq(query, organisationIdColumn, "00000000-0000-0000-0000-000000000000");
  }

  if (tenantContext.accessibleOrganisationIds.length === 1) {
    return applyEq(query, organisationIdColumn, tenantContext.accessibleOrganisationIds[0]!);
  }

  return applyIn(query, organisationIdColumn, tenantContext.accessibleOrganisationIds);
}

/**
 * Helper to filter applications by job's organisation.
 * Uses join to ensure proper tenant isolation.
 */
export function addApplicationOrgFilter<T>(
  query: ReturnType<SupabaseClient["from"]>,
  tenantContext: TenantContext,
): ReturnType<SupabaseClient["from"]> {
  if (tenantContext.isSuperAdmin) {
    return query;
  }

  if (tenantContext.accessibleOrganisationIds.length === 0) {
    // Return a query that will return no results
    return applyEq(query, "job_id", "00000000-0000-0000-0000-000000000000");
  }

  // Use join to filter by job's organisation_id
  const joinedQuery = query.select("*, jobs!inner(organisation_id)");

  if (tenantContext.accessibleOrganisationIds.length === 1) {
    return applyEq(
      joinedQuery,
      "jobs.organisation_id",
      tenantContext.accessibleOrganisationIds[0]!,
    ) as unknown as ReturnType<SupabaseClient["from"]>;
  }

  return applyIn(
    joinedQuery,
    "jobs.organisation_id",
    tenantContext.accessibleOrganisationIds,
  ) as unknown as ReturnType<SupabaseClient["from"]>;
}

/**
 * Helper to filter fit_scores by job's organisation.
 */
export function addFitScoreOrgFilter<T>(
  query: ReturnType<SupabaseClient["from"]>,
  tenantContext: TenantContext,
): ReturnType<SupabaseClient["from"]> {
  if (tenantContext.isSuperAdmin) {
    return query;
  }

  if (tenantContext.accessibleOrganisationIds.length === 0) {
    return applyEq(query, "job_id", "00000000-0000-0000-0000-000000000000");
  }

  const joinedQuery = query.select("*, jobs!inner(organisation_id)");

  if (tenantContext.accessibleOrganisationIds.length === 1) {
    return applyEq(
      joinedQuery,
      "jobs.organisation_id",
      tenantContext.accessibleOrganisationIds[0]!,
    ) as unknown as ReturnType<SupabaseClient["from"]>;
  }

  return applyIn(
    joinedQuery,
    "jobs.organisation_id",
    tenantContext.accessibleOrganisationIds,
  ) as unknown as ReturnType<SupabaseClient["from"]>;
}

/**
 * Helper to filter pipeline_candidates by job's organisation.
 */
export function addPipelineCandidateOrgFilter<T>(
  query: ReturnType<SupabaseClient["from"]>,
  tenantContext: TenantContext,
): ReturnType<SupabaseClient["from"]> {
  if (tenantContext.isSuperAdmin) {
    return query;
  }

  if (tenantContext.accessibleOrganisationIds.length === 0) {
    return applyEq(query, "job_id", "00000000-0000-0000-0000-000000000000");
  }

  const joinedQuery = query.select("*, jobs!inner(organisation_id)");

  if (tenantContext.accessibleOrganisationIds.length === 1) {
    return applyEq(
      joinedQuery,
      "jobs.organisation_id",
      tenantContext.accessibleOrganisationIds[0]!,
    ) as unknown as ReturnType<SupabaseClient["from"]>;
  }

  return applyIn(
    joinedQuery,
    "jobs.organisation_id",
    tenantContext.accessibleOrganisationIds,
  ) as unknown as ReturnType<SupabaseClient["from"]>;
}

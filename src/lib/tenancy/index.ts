/**
 * Tenant Isolation System
 *
 * Provides automatic tenant isolation for all database queries.
 * Use getTenantScopedClient() from @/lib/api-helpers in API routes.
 */

export type { TenantContext } from "./tenant-context";
export { createTenantContext, resolveAccessibleOrganisationIds } from "./tenant-context";
export {
  TenantScopedClient,
  createTenantScopedClient,
  ForbiddenError,
} from "./tenant-scoped-client";
export {
  addOrganisationFilter,
  addApplicationOrgFilter,
  addFitScoreOrgFilter,
  addPipelineCandidateOrgFilter,
} from "./query-helpers";
export {
  trackTenantViolation,
  trackTenantAccess,
  handleTenantError,
  withTenantMonitoring,
} from "./monitoring";

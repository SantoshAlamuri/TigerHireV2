import type { UserRole } from "@/types";

/**
 * Role-aware base paths for the SHARED job workspace and pipeline.
 *
 * LINK GENERATION ONLY. These mirror the Jobs/Pipeline nav bases in
 * `src/lib/navigation/registry.ts` so deep links rendered inside the shared
 * job-detail workspace point back to the path the user's role can actually
 * reach — instead of hardcoded `/recruit/*` links that a company-admin or
 * hiring-manager is not authorized for (which the server then bounces to Home).
 *
 * This is NOT an access decision. Server RBAC (middleware + dashboard route
 * policy) remains the only gate; these helpers must never be used to grant or
 * deny access — only to choose where a link points.
 */
export function jobsBasePath(role: UserRole | null | undefined): string {
  if (role === "hiring_manager") return "/company/my-jobs";
  // Leadership joins the recruiter on the redesigned list — the dashboard route
  // policy has admitted this role to /recruit/jobs since Brief 11, and sending
  // it back to /company/jobs was landing "back to jobs" on the old table.
  if (role === "recruiter" || role === "leadership" || role === "super_admin")
    return "/recruit/jobs";
  // Other company-shell roles
  return "/company/jobs";
}

export function pipelineBasePath(role: UserRole | null | undefined): string {
  if (role === "hiring_manager") return "/company/my-pipeline";
  // recruiter / leadership / super_admin
  return "/recruit/pipeline";
}

/** Pipeline link for a specific job, scoped to the role's authorized base. */
export function jobPipelineHref(role: UserRole | null | undefined, jobId: string): string {
  return `${pipelineBasePath(role)}?jobId=${encodeURIComponent(jobId)}`;
}

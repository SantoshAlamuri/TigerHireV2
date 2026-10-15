import { getTenantScopedClient, hasRole, jsonError } from "@/lib/api-helpers";
import { ForbiddenError } from "@/lib/tenancy/tenant-scoped-client";
import type { UserRole } from "@/types";
import type { NextResponse } from "next/server";

export type ApplicationAccessRow = {
  jobs?:
    | { organisation_id?: string | null; hiring_manager_id?: string | null }
    | Array<{ organisation_id?: string | null; hiring_manager_id?: string | null }>
    | null;
  candidates?: { user_id?: string | null } | Array<{ user_id?: string | null }> | null;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Enforce tenant + role access for recruiter-facing application routes.
 * Returns a JSON error response, or null when access is allowed.
 */
export async function assertApplicationRouteAccess(
  ctx: { userId: string; role: UserRole; organisationId: string | null },
  applicationId: string,
  app: ApplicationAccessRow,
): Promise<NextResponse | null> {
  const job = firstRelation(app.jobs);
  const candidate = firstRelation(app.candidates);

  if (hasRole(ctx, "candidate_pro", "candidate_free")) {
    const userId = candidate?.user_id ?? null;
    if (!userId || userId !== ctx.userId) return jsonError("Forbidden", 403);
    return null;
  }

  if (hasRole(ctx, "hiring_manager")) {
    if (!job?.hiring_manager_id || job.hiring_manager_id !== ctx.userId) {
      return jsonError("Forbidden", 403);
    }
    return null;
  }

  if (hasRole(ctx, "super_admin")) return null;

  if (hasRole(ctx, "leadership", "recruiter", "agency")) {
    const db = await getTenantScopedClient(ctx);
    try {
      await db.assertApplicationAccess(applicationId);
      return null;
    } catch (error) {
      if (error instanceof ForbiddenError) return jsonError("Forbidden", 403);
      throw error;
    }
  }

  return jsonError("Forbidden", 403);
}

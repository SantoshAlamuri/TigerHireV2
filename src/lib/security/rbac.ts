import type { UserRole } from "@/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export type { UserRole as Role } from "@/types";

export interface AuthContext {
  userId: string;
  role: UserRole;
  companyId?: string;
  organisationId?: string;
}

/**
 * Guard for API routes. Returns an AuthContext on success or a NextResponse
 * (401/403) on failure. Call at the top of every API handler.
 *
 * When resourceOrganisationId is provided, the user must belong to that org
 * (or be super_admin). Use for routes that operate on org-scoped resources.
 *
 * Usage:
 *   const auth = await requireRole(req, ["recruiter", "leadership"]);
 *   const auth = await requireRole(req, ["recruiter"], job.organisation_id);
 */
export async function requireRole(
  _req: NextRequest,
  allowedRoles: UserRole[],
  resourceOrganisationId?: string | null,
): Promise<AuthContext | NextResponse> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organisation_id")
    .eq("id", user.id)
    .single();

  if (!profile || !allowedRoles.includes(profile.role as UserRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (
    resourceOrganisationId != null &&
    profile.role !== "super_admin" &&
    profile.organisation_id !== resourceOrganisationId
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return {
    userId: user.id,
    role: profile.role as UserRole,
    organisationId: profile.organisation_id ?? undefined,
    companyId: profile.organisation_id ?? undefined,
  };
}

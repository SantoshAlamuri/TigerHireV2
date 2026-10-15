import type { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext, jsonError, requireAuth, type AuthContext } from "@/lib/api-helpers";
import { getCachedAuthProfile, setCachedAuthProfile } from "@/lib/redis/auth-profile-cache";
import { setSentryRequestContext } from "@/lib/observability/sentry";
import type { UserRole } from "@/types";

export function getTryoutOrgId(): string | null {
  const id = (process.env.TRYOUT_ORG_ID ?? "").trim();
  return id || null;
}

async function profileFromUserId(userId: string): Promise<AuthContext | null> {
  const cached = await getCachedAuthProfile(userId);
  if (cached) {
    if (
      !cached.is_active ||
      cached.role_status === "pending" ||
      cached.role_status === "suspended"
    ) {
      return null;
    }
    setSentryRequestContext({ userId, organisationId: cached.organisation_id });
    return {
      userId,
      role: cached.role,
      organisationId: cached.organisation_id,
      isActive: cached.is_active,
      roleStatus: cached.role_status ?? "active",
      isPlatformAdmin: cached.is_platform_admin ?? false,
      isOrgAdmin: Boolean(cached.is_org_admin),
    };
  }

  const admin = createSupabaseAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, organisation_id, is_active, role_status, is_platform_admin, is_org_admin")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) return null;
  if (!profile.is_active || profile.role_status !== "active") return null;

  await setCachedAuthProfile(userId, {
    role: profile.role as UserRole,
    organisation_id: profile.organisation_id,
    is_active: Boolean(profile.is_active),
    role_status: profile.role_status ?? "active",
    is_platform_admin: Boolean(profile.is_platform_admin),
    is_org_admin: Boolean(profile.is_org_admin),
  });

  setSentryRequestContext({ userId, organisationId: profile.organisation_id });
  return {
    userId,
    role: profile.role as UserRole,
    organisationId: profile.organisation_id,
    isActive: Boolean(profile.is_active),
    roleStatus: (profile.role_status as "pending" | "active" | "suspended") ?? "active",
    isPlatformAdmin: Boolean(profile.is_platform_admin),
    isOrgAdmin: Boolean(profile.is_org_admin),
  };
}

/**
 * Cookie session (same-origin) or Bearer Supabase access token (demo app cross-origin).
 */
export async function getTryoutAuthContext(request: NextRequest): Promise<AuthContext | null> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) return null;
    const admin = createSupabaseAdmin();
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return null;
    return profileFromUserId(data.user.id);
  }

  const server = await createSupabaseServerClient();
  return getAuthContext(server);
}

export function assertTryoutOrg(ctx: AuthContext) {
  const tryoutOrgId = getTryoutOrgId();
  if (!tryoutOrgId) {
    return jsonError("Tryout is not configured on this server (TRYOUT_ORG_ID missing).", 503);
  }
  if (!ctx.organisationId || ctx.organisationId !== tryoutOrgId) {
    return jsonError("Forbidden — account is not in the tryout organisation.", 403);
  }
  return null;
}

export async function requireTryoutAuth(request: NextRequest) {
  const ctx = await getTryoutAuthContext(request);
  if (!requireAuth(ctx)) return { ctx: null, error: jsonError("Unauthorized", 401) as Response };
  const orgError = assertTryoutOrg(ctx);
  if (orgError) return { ctx: null, error: orgError as Response };
  return { ctx, error: null };
}

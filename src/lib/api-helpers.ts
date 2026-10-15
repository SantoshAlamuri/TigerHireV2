import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedAuthProfile, setCachedAuthProfile } from "@/lib/redis/auth-profile-cache";
import { reportError } from "@/lib/observability/report-error";
import { getCorrelationId } from "@/lib/observability/correlation";
import { setSentryRequestContext } from "@/lib/observability/sentry";
import type { UserRole } from "@/types";

export { reportError };

/**
 * Standard logging context for API routes. Use when calling reportError or handleApiError
 * so logs and Sentry have consistent fields: route, userId (when authenticated), requestId (correlation).
 */
export function apiLogContext(
  route: string,
  ctx?: { userId?: string } | null,
): { route: string; userId?: string; requestId?: string } {
  const requestId = getCorrelationId();
  return {
    route,
    ...(ctx?.userId && { userId: ctx.userId }),
    ...(requestId && { requestId }),
  };
}

export function jsonError(message: string, status: number = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function jsonSuccess<T>(data: T, status: number = 200) {
  return NextResponse.json(data, { status });
}

export function handleZodError(error: ZodError) {
  const messages = error.issues.map((e) => e.message);
  return jsonError(messages.join("; "), 422);
}

/**
 * Parse request JSON body; on failure report error and return an error response.
 * Use in API routes: const parsed = await parseJsonBody<MyShape>(request, "POST /api/..."); if (parsed.errorResponse) return parsed.errorResponse; const body = parsed.body;
 *
 * Prefer Zod validation at the boundary for untrusted input; the generic is for ergonomic typing after you validate or for internal routes.
 */
export async function parseJsonBody<T = unknown>(
  request: Request,
  route: string,
): Promise<{ body: T; errorResponse: null } | { body: null; errorResponse: NextResponse }> {
  try {
    const body = (await request.json()) as T;
    return { body, errorResponse: null };
  } catch (err) {
    reportError(err, { route });
    return { body: null, errorResponse: jsonError("Invalid JSON body", 400) };
  }
}

export interface AuthContext {
  userId: string;
  role: UserRole;
  organisationId: string | null;
  isActive?: boolean;
  roleStatus?: "pending" | "active" | "suspended";
  isPlatformAdmin?: boolean;
  /** Org Setup mode + org-wide settings routes (Brief 1). */
  isOrgAdmin?: boolean;
}

/**
 * Verify the current user and load their profile.
 * Returns null if not authenticated or profile missing.
 * Uses Redis cache for profile (role, organisation_id) to avoid repeated DB round-trips.
 *
 * @param existingClient — Pass the same `createSupabaseServerClient()` instance as your route
 * uses for DB work to avoid a second client (cookie + client setup) per request.
 */
export async function getAuthContext(existingClient?: SupabaseClient): Promise<AuthContext | null> {
  const supabase = existingClient ?? (await createSupabaseServerClient());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const cached = await getCachedAuthProfile(user.id);
  if (cached) {
    if (!cached.is_active || cached.role_status === "pending" || cached.role_status === "suspended")
      return null;
    setSentryRequestContext({
      userId: user.id,
      organisationId: cached.organisation_id,
    });
    return {
      userId: user.id,
      role: cached.role,
      organisationId: cached.organisation_id,
      isActive: cached.is_active,
      roleStatus: cached.role_status ?? "active",
      isPlatformAdmin: cached.is_platform_admin ?? false,
      isOrgAdmin: Boolean(cached.is_org_admin),
    };
  }

  let profile: {
    role: UserRole;
    organisation_id: string | null;
    is_active: boolean;
    role_status: "pending" | "active" | "suspended";
    is_platform_admin: boolean;
    is_org_admin: boolean;
  } | null = null;
  const profileSelect =
    "role, organisation_id, is_active, role_status, is_platform_admin, is_org_admin";
  const { data: profileWithActive, error: profileWithActiveError } = await supabase
    .from("profiles")
    .select(profileSelect)
    .eq("id", user.id)
    .single();

  if (profileWithActiveError?.message?.includes("column profiles.is_active does not exist")) {
    const { data: profileLegacy } = await supabase
      .from("profiles")
      .select("role, organisation_id")
      .eq("id", user.id)
      .single();
    profile = profileLegacy
      ? {
          role: profileLegacy.role as UserRole,
          organisation_id: profileLegacy.organisation_id ?? null,
          is_active: true,
          role_status: "active",
          is_platform_admin: false,
          is_org_admin: false,
        }
      : null;
  } else if (
    profileWithActiveError?.message?.includes("column profiles.is_org_admin does not exist")
  ) {
    const { data: profileNoOrgAdmin } = await supabase
      .from("profiles")
      .select("role, organisation_id, is_active, role_status, is_platform_admin")
      .eq("id", user.id)
      .single();
    profile = profileNoOrgAdmin
      ? {
          role: profileNoOrgAdmin.role as UserRole,
          organisation_id: profileNoOrgAdmin.organisation_id ?? null,
          is_active: Boolean(profileNoOrgAdmin.is_active),
          role_status:
            (profileNoOrgAdmin.role_status as "pending" | "active" | "suspended") ?? "active",
          is_platform_admin: Boolean(profileNoOrgAdmin.is_platform_admin),
          is_org_admin: false,
        }
      : null;
  } else {
    profile = profileWithActive
      ? {
          role: profileWithActive.role as UserRole,
          organisation_id: profileWithActive.organisation_id ?? null,
          is_active: Boolean(profileWithActive.is_active),
          role_status:
            (profileWithActive.role_status as "pending" | "active" | "suspended") ?? "active",
          is_platform_admin: Boolean(profileWithActive.is_platform_admin),
          is_org_admin: Boolean(
            (profileWithActive as { is_org_admin?: boolean }).is_org_admin ?? false,
          ),
        }
      : null;
  }

  if (!profile) return null;
  if (!profile.is_active || profile.role_status !== "active") return null;

  await setCachedAuthProfile(user.id, {
    role: profile.role as UserRole,
    organisation_id: profile.organisation_id,
    is_active: Boolean(profile.is_active),
    role_status: profile.role_status,
    is_platform_admin: profile.is_platform_admin,
    is_org_admin: profile.is_org_admin,
  });

  setSentryRequestContext({
    userId: user.id,
    organisationId: profile.organisation_id,
  });

  return {
    userId: user.id,
    role: profile.role as UserRole,
    organisationId: profile.organisation_id,
    isActive: Boolean(profile.is_active),
    roleStatus: profile.role_status,
    isPlatformAdmin: profile.is_platform_admin,
    isOrgAdmin: profile.is_org_admin,
  };
}

export function requireAuth(ctx: AuthContext | null): ctx is AuthContext {
  return ctx !== null;
}

export function hasRole(ctx: AuthContext, ...roles: UserRole[]): boolean {
  return roles.includes(ctx.role);
}

/**
 * Enforce organisation boundary for tenant-scoped resources.
 * Super admins are allowed to cross org boundaries.
 */
export function ensureOrganisationAccess(
  ctx: AuthContext,
  resourceOrganisationId: string | null | undefined,
): NextResponse | null {
  if (ctx.role === "super_admin") return null;
  if (
    !ctx.organisationId ||
    !resourceOrganisationId ||
    ctx.organisationId !== resourceOrganisationId
  ) {
    return jsonError("Forbidden", 403);
  }
  return null;
}

/**
 * Get tenant-scoped Supabase client that automatically enforces tenant isolation.
 * Use this instead of createSupabaseServerClient() in API routes to ensure tenant isolation.
 *
 * @example
 * ```ts
 * const ctx = await getAuthContext();
 * if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
 *
 * const db = await getTenantScopedClient(ctx);
 * const jobs = await db.jobs().select("*").eq("status", "open");
 * ```
 */
export async function getTenantScopedClient(ctx: AuthContext) {
  const { createTenantScopedClient } = await import("@/lib/tenancy/tenant-scoped-client");
  return createTenantScopedClient(ctx);
}

/**
 * Unified API error handler: reports to Sentry via reportError() and returns
 * a standardised JSON error response. Use in every route catch block.
 */
export function handleApiError(
  err: unknown,
  message: string,
  context?: { route?: string; userId?: string; [key: string]: unknown },
): NextResponse {
  reportError(err, context);
  const isDev = process.env.NODE_ENV === "development";
  return NextResponse.json(
    {
      error: message,
      ...(isDev && {
        // Supabase/PostgREST errors are plain objects; String() would print
        // "[object Object]" and hide the actual failure from the developer.
        detail:
          err instanceof Error
            ? err.message
            : typeof err === "object" && err !== null
              ? JSON.stringify(err)
              : String(err),
      }),
    },
    { status: 500 },
  );
}

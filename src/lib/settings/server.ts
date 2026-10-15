import type { NextRequest } from "next/server";
import { getAuthContext, hasRole, jsonError, requireAuth } from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateOrigin } from "@/lib/security/csrf";
import {
  getOrgSettingsPermissions,
  hasSettingsCapability,
  type SettingsCapability,
} from "@/lib/settings/permissions";

export interface SettingsRequestContext {
  userId: string;
  role: string;
  organisationId: string;
  actorEmail: string | null;
}

export async function requireSettingsAdmin(
  request: NextRequest,
  options?: { validateCsrf?: boolean; capability?: SettingsCapability },
) {
  if (options?.validateCsrf) {
    const csrf = validateOrigin(request);
    if (csrf) return { error: csrf };
  }

  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return { error: jsonError("Unauthorized", 401) };
  if (!ctx.organisationId)
    return { error: jsonError("No organisation linked to your account", 400) };

  const supabase = await createSupabaseServerClient();
  const capability = options?.capability ?? "view_settings";
  if (!hasRole(ctx, "leadership", "super_admin")) {
    const permissions = await getOrgSettingsPermissions(supabase, ctx.organisationId);
    const allowed = hasSettingsCapability(ctx.role, capability, permissions);
    if (!allowed) return { error: jsonError("Forbidden", 403) };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return {
    context: {
      userId: ctx.userId,
      role: ctx.role,
      organisationId: ctx.organisationId,
      actorEmail: user?.email ?? null,
    } satisfies SettingsRequestContext,
  };
}

export function settingsApiContext(route: string, userId?: string) {
  return {
    route,
    ...(userId ? { userId } : {}),
  };
}

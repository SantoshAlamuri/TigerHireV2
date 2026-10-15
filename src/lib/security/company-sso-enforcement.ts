import type { UserRole } from "@/types";
import { COMPANY_SIDE_ROLES } from "@/types/database";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

type AuthProfileScope = {
  role: UserRole;
  organisationId: string | null;
};

const PASSWORD_AUTH_PROVIDERS = new Set(["email", "phone"]);

export function isCompanySideRole(role: UserRole): boolean {
  return (COMPANY_SIDE_ROLES as readonly UserRole[]).includes(role);
}

export function isPasswordAuthProvider(provider: string | null | undefined): boolean {
  if (!provider) return false;
  return PASSWORD_AUTH_PROVIDERS.has(provider.toLowerCase());
}

export async function isOrganisationSsoEnforced(organisationId: string | null): Promise<boolean> {
  if (!organisationId) return false;
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("organisations")
    .select("enforce_sso")
    .eq("id", organisationId)
    .maybeSingle();

  if (error) {
    logger.warn("Failed to read organisation SSO policy", {
      route: "company-sso-enforcement",
      organisationId,
      error: error.message,
      code: error.code,
    });
    return false;
  }

  return data?.enforce_sso === true;
}

export async function shouldEnforceCompanySsoForProfile(
  profile: AuthProfileScope,
): Promise<boolean> {
  if (!isCompanySideRole(profile.role)) return false;
  return isOrganisationSsoEnforced(profile.organisationId);
}

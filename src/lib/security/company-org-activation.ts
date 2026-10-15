import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@/types/database";
import { getCachedAuthProfile, type CachedAuthProfile } from "@/lib/redis/auth-profile-cache";
import { companyActivationApiPathAllowed } from "./company-org-activation-guards";

export {
  COMPANY_PENDING_ACTIVATION_PATH,
  companyActivationShouldBlockDashboardPath,
  companyActivationApiPathAllowed,
} from "./company-org-activation-guards";

export async function isCompanyOrganisationPendingActivation(
  supabase: Pick<SupabaseClient, "from">,
  organisationId: string | null | undefined,
): Promise<boolean> {
  if (!organisationId) return false;
  const { data, error } = await supabase
    .from("organisations")
    .select("type, approval")
    .eq("id", organisationId)
    .maybeSingle();
  if (error || !data) return false;
  return data.type === "company" && data.approval === "pending";
}

export async function loadProfileOrgAndRoleForActivationGate(
  supabase: Pick<SupabaseClient, "from">,
  userId: string,
  // When the caller already resolved the auth profile this request (e.g. the
  // account-status gate), pass it to skip a redundant cache/DB read. `null`
  // means "already resolved, no profile exists".
  prefetched?: CachedAuthProfile | null,
): Promise<{ role: UserRole; organisationId: string | null } | null> {
  const cached = prefetched !== undefined ? prefetched : await getCachedAuthProfile(userId);
  if (cached?.is_active === false) return null;
  if (cached) {
    return { role: cached.role, organisationId: cached.organisation_id ?? null };
  }
  if (prefetched !== undefined) return null; // resolution already done upstream
  const { data } = await supabase
    .from("profiles")
    .select("role, organisation_id")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.role) return null;
  return {
    role: data.role as UserRole,
    organisationId: data.organisation_id ?? null,
  };
}

/** True when this API call should be rejected (403) until the company org is approved. */
export async function companyOrganisationApiActivationDenied(
  supabase: Pick<SupabaseClient, "from">,
  userId: string,
  pathname: string,
  prefetched?: CachedAuthProfile | null,
): Promise<boolean> {
  if (companyActivationApiPathAllowed(pathname)) return false;
  const pr = await loadProfileOrgAndRoleForActivationGate(supabase, userId, prefetched);
  if (!pr || pr.role === "super_admin" || !pr.organisationId) return false;
  return isCompanyOrganisationPendingActivation(supabase, pr.organisationId);
}

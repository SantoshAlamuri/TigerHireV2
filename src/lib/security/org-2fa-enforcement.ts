import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

/**
 * Returns true when an organisation has explicitly enabled 2FA enforcement.
 * Fails open (false) when the column is not available yet during rollout.
 */
export async function shouldEnforceOrganisation2FA(
  organisationId: string | null,
): Promise<boolean> {
  if (!organisationId) return false;
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("organisations")
    .select("enforce_2fa")
    .eq("id", organisationId)
    .maybeSingle();

  if (error) {
    logger.warn("Failed to read organisation 2FA policy", {
      route: "org-2fa-enforcement",
      organisationId,
      error: error.message,
      code: error.code,
    });
    return false;
  }

  return data?.enforce_2fa === true;
}

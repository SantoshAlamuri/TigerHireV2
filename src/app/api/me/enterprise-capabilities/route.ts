import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { hasAnyEnterpriseRole } from "@/lib/security/enterprise-roles";
import { getOrgSettingsPermissions, hasSettingsCapability } from "@/lib/settings/permissions";

/**
 * GET /api/me/enterprise-capabilities
 * Surfaces enterprise roles (employee_roles) for UI routing — e.g. Finance Inbox for recruiters
 * who also have the finance enterprise role.
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const supabase = await createSupabaseServerClient();
    const finance = await hasAnyEnterpriseRole(
      ctx.userId,
      ["finance", "leadership", "super_admin"],
      supabase,
    );

    let canCreateOffers = false;
    if (ctx.organisationId) {
      const permissions = await getOrgSettingsPermissions(supabase, ctx.organisationId);
      canCreateOffers =
        ctx.role === "leadership" ||
        ctx.role === "super_admin" ||
        hasSettingsCapability(ctx.role, "create_offers", permissions);
    }

    return jsonSuccess({ finance, canCreateOffers });
  } catch (err) {
    return handleApiError(err, "Failed to load capabilities", {
      route: "GET /api/me/enterprise-capabilities",
    });
  }
}

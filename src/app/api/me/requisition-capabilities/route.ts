import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import {
  getOrgSettingsPermissions,
  isRequisitionAdvancedModeEnabled,
} from "@/lib/settings/permissions";

/**
 * GET /api/me/requisition-capabilities
 * UI surfacing guard for progressive disclosure of advanced requisition controls.
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonSuccess({ advancedMode: false });

    const supabase = await createSupabaseServerClient();
    const permissions = await getOrgSettingsPermissions(supabase, ctx.organisationId);

    return jsonSuccess({
      advancedMode: isRequisitionAdvancedModeEnabled(permissions),
    });
  } catch (err) {
    return handleApiError(err, "Failed to load requisition capabilities", {
      route: "GET /api/me/requisition-capabilities",
    });
  }
}

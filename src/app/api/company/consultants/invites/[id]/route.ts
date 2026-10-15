import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { logger } from "@/lib/observability/logger";
import { consultantInviteIdSchema } from "@/lib/validations/consultant-invites";
import { canManageConsultants } from "@/lib/consultants/access";

/**
 * DELETE /api/company/consultants/invites/[id]
 * Revoke a pending consultant invite. The token stops working immediately.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const { id: rawId } = await params;
    const parsedId = consultantInviteIdSchema.safeParse(rawId);
    if (!parsedId.success) return jsonError("Invite not found", 404);
    const id = parsedId.data;

    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!canManageConsultants(ctx)) return jsonError("Only leadership can revoke an invite", 403);
    if (!ctx.organisationId) return jsonError("No organisation associated with your account", 400);

    const admin = createSupabaseAdmin();

    // The org filter is the tenant boundary — never revoke another company's invite.
    const { data: updated, error } = await admin
      .from("agency_client_invites")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoked_by: ctx.userId,
      })
      .eq("id", id)
      .eq("company_organisation_id", ctx.organisationId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (error) {
      logger.error("Failed to revoke consultant invite", { error: error.message, inviteId: id });
      return jsonError("Failed to revoke invite", 500);
    }
    if (!updated) return jsonError("Invite not found or no longer pending", 404);

    return jsonSuccess({ message: "Invite revoked", id: updated.id });
  } catch (err) {
    return handleApiError(err, "Failed to revoke invite", {
      route: "DELETE /api/company/consultants/invites/[id]",
    });
  }
}

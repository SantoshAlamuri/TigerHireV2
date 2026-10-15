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
 * DELETE /api/company/consultants/links/[id]
 * Remove a consulting firm's access to this company's roles.
 *
 * `agency_clients` has no company-side RLS policy — its DELETE policy is
 * agency-only — so this runs with the service role, filtered to the caller's own
 * org. Without this a company had no way to revoke access it never granted.
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
    if (!parsedId.success) return jsonError("Consultant not found for your organisation", 404);
    const id = parsedId.data;

    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!canManageConsultants(ctx))
      return jsonError("Only leadership can remove a consulting firm", 403);
    if (!ctx.organisationId) return jsonError("No organisation associated with your account", 400);

    const admin = createSupabaseAdmin();

    const { data: removed, error } = await admin
      .from("agency_clients")
      .delete()
      .eq("id", id)
      .eq("client_organisation_id", ctx.organisationId)
      .select("id, agency_organisation_id")
      .maybeSingle();

    if (error) {
      logger.error("Failed to remove consultant link", { error: error.message, linkId: id });
      return jsonError("Failed to remove consultant", 500);
    }
    if (!removed) return jsonError("Consultant not found for your organisation", 404);

    logger.info("Company removed consultant access", {
      companyOrganisationId: ctx.organisationId,
      agencyOrganisationId: removed.agency_organisation_id,
      actorUserId: ctx.userId,
    });

    return jsonSuccess({ message: "Consultant access removed", id: removed.id });
  } catch (err) {
    return handleApiError(err, "Failed to remove consultant", {
      route: "DELETE /api/company/consultants/links/[id]",
    });
  }
}

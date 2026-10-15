import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleZodError,
  handleApiError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { logger } from "@/lib/observability/logger";
import {
  consultantInviteIdSchema,
  consultantRequestDecisionSchema,
} from "@/lib/validations/consultant-invites";
import { canManageConsultants } from "@/lib/consultants/access";

/**
 * POST /api/company/consultants/links/[id]/decide
 * Body: { decision: "approve" | "decline" }
 *
 * The company's side of a firm's access request. Approving is what turns the row
 * live — an agency can only ever create it as `pending`, enforced in the RLS
 * INSERT policy and not just here, so this is the moment access is granted.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const { id: rawId } = await params;
    const parsedId = consultantInviteIdSchema.safeParse(rawId);
    if (!parsedId.success) return jsonError("Request not found", 404);
    const id = parsedId.data;

    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!canManageConsultants(ctx)) {
      return jsonError("Only leadership can decide who works on your roles", 403);
    }
    if (!ctx.organisationId) return jsonError("No organisation associated with your account", 400);

    const parsedBody = await parseJsonBody(
      request,
      "POST /api/company/consultants/links/[id]/decide",
    );
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = consultantRequestDecisionSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const approving = parsed.data.decision === "approve";
    const admin = createSupabaseAdmin();

    // The org filter is the tenant boundary, and `status = pending` makes this
    // idempotent — a double-click cannot re-approve something already decided.
    const { data: updated, error } = await admin
      .from("agency_clients")
      .update({
        status: approving ? "active" : "revoked",
        decided_at: new Date().toISOString(),
        decided_by: ctx.userId,
      })
      .eq("id", id)
      .eq("client_organisation_id", ctx.organisationId)
      .eq("status", "pending")
      .select("id, agency_organisation_id, status")
      .maybeSingle();

    if (error) {
      logger.error("Failed to decide consultant access request", {
        error: error.message,
        linkId: id,
        organisationId: ctx.organisationId,
      });
      return jsonError("Failed to record your decision", 500);
    }
    if (!updated) return jsonError("Request not found or already decided", 404);

    logger.info("Company decided a consultant access request", {
      event: "consultant_access_request_decided",
      companyOrganisationId: ctx.organisationId,
      agencyOrganisationId: updated.agency_organisation_id,
      decision: updated.status,
      actorUserId: ctx.userId,
    });

    return jsonSuccess({
      id: updated.id,
      status: updated.status,
      message: approving
        ? "Approved — they can now see your open roles"
        : "Declined — they have no access to your roles",
    });
  } catch (err) {
    return handleApiError(err, "Failed to record your decision", {
      route: "POST /api/company/consultants/links/[id]/decide",
    });
  }
}

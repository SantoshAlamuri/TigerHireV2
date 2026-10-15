import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  ensureOrganisationAccess,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
  handleZodError,
} from "@/lib/api-helpers";
import { financeDecisionSchema } from "@/lib/validations/offers";
import { hasAnyEnterpriseRole } from "@/lib/security/enterprise-roles";
import { validateOrigin } from "@/lib/security/csrf";
import { getRequestClientIp } from "@/lib/audit/client-ip";
import { executeOfferFinanceDecision } from "@/lib/offers/offer-finance-decision";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const { id } = await params;
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const supabase = await createSupabaseServerClient();
    const isFinance = await hasAnyEnterpriseRole(
      ctx.userId,
      ["leadership", "super_admin"],
      supabase,
    );
    if (!isFinance) return jsonError("Forbidden", 403);

    const { body, errorResponse } = await parseJsonBody(request, "POST /api/offers/[id]/finance");
    if (errorResponse) return errorResponse;
    const parsed = financeDecisionSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const admin = createSupabaseAdmin();
    const { data: offer, error: offerError } = await admin
      .from("offers")
      .select("id, organisation_id")
      .eq("id", id)
      .single();
    if (offerError || !offer) return jsonError("Offer not found", 404);
    const orgAccessError = ensureOrganisationAccess(ctx, offer.organisation_id);
    if (orgAccessError) return orgAccessError;

    const result = await executeOfferFinanceDecision(admin, {
      offerId: id,
      decision: parsed.data.decision,
      comment: parsed.data.comment ?? null,
      actorProfileId: ctx.userId,
      actorRole: ctx.role,
      requestIp: getRequestClientIp(request),
      auditChannel: "web",
      logRoute: "POST /api/offers/[id]/finance",
    });

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }
    return jsonSuccess({ offer: result.offer, autoSend: result.autoSend ?? null });
  } catch (err) {
    return handleApiError(err, "Failed to submit finance decision", {
      route: "POST /api/offers/[id]/finance",
    });
  }
}

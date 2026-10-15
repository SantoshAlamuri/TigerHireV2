import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  ensureOrganisationAccess,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { getRequestClientIp } from "@/lib/audit/client-ip";
import { getOrgSettingsPermissions } from "@/lib/settings/permissions";
import { executeHiringManagerOfferApproval } from "@/lib/offers/offer-hm-approval";
import { forbidUnlessHiringManagerOwnsOfferJob } from "@/lib/security/hiring-manager-offer-access";

const offerIdParamsSchema = z.object({
  id: z.string().uuid(),
});

type RouteContext = { params: Promise<{ id: string }> };
const hiringManagerApproveBodySchema = z.object({}).strict();

export async function POST(_request: NextRequest, context: RouteContext) {
  const csrf = validateOrigin(_request);
  if (csrf) return csrf;
  try {
    const paramsParsed = offerIdParamsSchema.safeParse(await context.params);
    if (!paramsParsed.success) return jsonError("Invalid offer id", 400);
    const { id } = paramsParsed.data;
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);
    const body = await _request.json().catch(() => ({}));
    const bodyParsed = hiringManagerApproveBodySchema.safeParse(body);
    if (!bodyParsed.success) return jsonError("Invalid request body", 400);

    const supabase = await createSupabaseServerClient();
    const permissions = await getOrgSettingsPermissions(supabase, ctx.organisationId);
    const admin = createSupabaseAdmin();

    const { data: offer, error: offerErr } = await admin
      .from("offers")
      .select("id, organisation_id")
      .eq("id", id)
      .maybeSingle();
    if (offerErr || !offer) return jsonError("Offer not found", 404);
    const orgErr = ensureOrganisationAccess(ctx, offer.organisation_id as string);
    if (orgErr) return orgErr;
    const hmScopeErr = await forbidUnlessHiringManagerOwnsOfferJob({ ctx, admin, offerId: id });
    if (hmScopeErr) return hmScopeErr;

    const result = await executeHiringManagerOfferApproval({
      admin,
      offerId: id,
      organisationId: ctx.organisationId,
      actorProfileId: ctx.userId,
      actorRole: ctx.role,
      requestIp: getRequestClientIp(_request),
      permissions,
    });

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonSuccess({ ok: true });
  } catch (err) {
    return handleApiError(err, "Failed to approve offer draft", {
      route: "POST /api/offers/[id]/hiring-manager-approve",
    });
  }
}

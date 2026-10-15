import { NextRequest, NextResponse } from "next/server";
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
import { hasAnyEnterpriseRole } from "@/lib/security/enterprise-roles";
import { validateOrigin } from "@/lib/security/csrf";
import { getRequestClientIp } from "@/lib/audit/client-ip";
import { forbidUnlessHiringManagerOwnsOfferJob } from "@/lib/security/hiring-manager-offer-access";
import { executeOfferSend } from "@/lib/offers/offer-send";
import { z } from "zod";

const sendOfferBodySchema = z.object({}).strict();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const { id } = await params;
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    const body = await request.json().catch(() => ({}));
    const bodyParsed = sendOfferBodySchema.safeParse(body);
    if (!bodyParsed.success) return jsonError("Invalid request body", 400);

    const supabase = await createSupabaseServerClient();
    const canSend = await hasAnyEnterpriseRole(
      ctx.userId,
      ["leadership", "recruiter", "hiring_manager", "super_admin"],
      supabase,
    );
    if (!canSend) return jsonError("Forbidden", 403);

    const admin = createSupabaseAdmin();
    const { data: offer, error: offerError } = await admin
      .from("offers")
      .select("id, organisation_id")
      .eq("id", id)
      .maybeSingle();
    if (offerError || !offer) return jsonError("Offer not found", 404);
    const orgAccessError = ensureOrganisationAccess(ctx, offer.organisation_id as string);
    if (orgAccessError) return orgAccessError;
    const hmErr = await forbidUnlessHiringManagerOwnsOfferJob({
      ctx,
      admin,
      offerId: id,
    });
    if (hmErr) return hmErr;

    const sendResult = await executeOfferSend({
      offerId: id,
      actorProfileId: ctx.userId,
      actorRole: ctx.role,
      actorOrganisationId: ctx.organisationId,
      requestIp: getRequestClientIp(request),
      userAgent: request.headers.get("user-agent"),
      enforceSendCapability: true,
      logRoute: "POST /api/offers/[id]/send",
    });
    if (!sendResult.ok) {
      if (sendResult.body) {
        return NextResponse.json(sendResult.body, { status: sendResult.status });
      }
      return jsonError(sendResult.error, sendResult.status);
    }
    return jsonSuccess({ offer: sendResult.offer });
  } catch (err) {
    return handleApiError(err, "Failed to send offer", { route: "POST /api/offers/[id]/send" });
  }
}

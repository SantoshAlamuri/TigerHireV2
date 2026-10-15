import { NextRequest } from "next/server";
import { z } from "zod";
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
import { hasAnyEnterpriseRole } from "@/lib/security/enterprise-roles";
import { validateOrigin } from "@/lib/security/csrf";
import { forbidUnlessHiringManagerOwnsOfferJob } from "@/lib/security/hiring-manager-offer-access";

const bodySchema = z.object({
  expires_at: z.string().datetime(),
});

/**
 * POST /api/offers/[id]/signing/extend — extend native offer deadline.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const { id } = await params;
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const supabase = await createSupabaseServerClient();
    const allowed = await hasAnyEnterpriseRole(
      ctx.userId,
      ["leadership", "recruiter", "hiring_manager", "super_admin"],
      supabase,
    );
    if (!allowed) return jsonError("Forbidden", 403);

    const parsedBody = await parseJsonBody(request, "POST /api/offers/[id]/signing/extend");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = bodySchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const nextExpires = new Date(parsed.data.expires_at);
    if (nextExpires.getTime() <= Date.now()) {
      return jsonError("New expiry must be in the future", 400);
    }

    const admin = createSupabaseAdmin();
    const { data: offer, error } = await admin
      .from("offers")
      .select("id, organisation_id, status, signing_status")
      .eq("id", id)
      .maybeSingle();

    if (error || !offer) return jsonError("Offer not found", 404);
    const orgErr = ensureOrganisationAccess(ctx, offer.organisation_id as string);
    if (orgErr) return orgErr;
    const hmErr = await forbidUnlessHiringManagerOwnsOfferJob({ ctx, admin, offerId: id });
    if (hmErr) return hmErr;

    if ((offer.status as string) !== "sent") {
      return jsonError("Only sent offers can be extended", 409);
    }
    if (offer.signing_status === "signed" || offer.signing_status === "declined") {
      return jsonError("Offer is already closed", 409);
    }

    const { data: updated, error: uErr } = await admin
      .from("offers")
      .update({ expires_at: nextExpires.toISOString() })
      .eq("id", id)
      .select("expires_at")
      .maybeSingle();

    if (uErr || !updated) return jsonError("Failed to extend deadline", 500);

    return jsonSuccess({ success: true, expires_at: updated.expires_at });
  } catch (err) {
    return handleApiError(err, "Failed to extend deadline", {
      route: "POST /api/offers/[id]/signing/extend",
    });
  }
}

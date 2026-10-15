import { NextRequest } from "next/server";
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
import { forbidUnlessHiringManagerOwnsOfferJob } from "@/lib/security/hiring-manager-offer-access";

/**
 * GET /api/offers/[id]/signing — offer signing timeline + counters for dashboard.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const supabase = await createSupabaseServerClient();
    const allowed = await hasAnyEnterpriseRole(
      ctx.userId,
      ["leadership", "recruiter", "hiring_manager", "finance", "super_admin"],
      supabase,
    );
    if (!allowed) return jsonError("Forbidden", 403);

    const admin = createSupabaseAdmin();
    const { data: offer, error: oErr } = await admin
      .from("offers")
      .select(
        "id, organisation_id, status, signing_status, sent_at, first_viewed_at, last_viewed_at, view_count, signed_at, signer_name, expires_at, declined_at, expired_at, signed_pdf_path, decline_reason, public_token",
      )
      .eq("id", id)
      .maybeSingle();

    if (oErr || !offer) return jsonError("Offer not found", 404);
    const orgErr = ensureOrganisationAccess(ctx, offer.organisation_id as string);
    if (orgErr) return orgErr;
    const hmErr = await forbidUnlessHiringManagerOwnsOfferJob({ ctx, admin, offerId: id });
    if (hmErr) return hmErr;

    const { data: events, error: eErr } = await admin
      .from("offer_events")
      .select("id, event_type, occurred_at, actor_ip, actor_user_agent, actor_name, metadata")
      .eq("offer_id", id)
      .order("occurred_at", { ascending: true });

    if (eErr) return jsonError("Failed to load timeline", 500);

    return jsonSuccess({ offer, events: events ?? [] });
  } catch (err) {
    return handleApiError(err, "Failed to load signing timeline", {
      route: "GET /api/offers/[id]/signing",
    });
  }
}

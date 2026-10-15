import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  handleApiError,
  jsonError,
  jsonSuccess,
  requireAuth,
} from "@/lib/api-helpers";
import { assertCanManageReferralCampaigns, buildCampaignMetrics } from "@/lib/referrers/campaigns";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);
    if (!assertCanManageReferralCampaigns(ctx.role)) return jsonError("Forbidden", 403);

    const admin = createSupabaseAdmin();
    const payload = await buildCampaignMetrics(admin, id, ctx.organisationId);
    if (!payload) return jsonError("Campaign not found", 404);

    return jsonSuccess(payload);
  } catch (err) {
    return handleApiError(err, "Failed to fetch referral campaign metrics", {
      route: "GET /api/referral-campaigns/[id]/metrics",
    });
  }
}

import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  handleApiError,
  jsonError,
  jsonSuccess,
  requireAuth,
} from "@/lib/api-helpers";
import { buildCampaignMetrics } from "@/lib/referrers/campaigns";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id: jobId } = await params;
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);

    const admin = createSupabaseAdmin();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: links, error: linkErr } = await admin
      .from("referral_campaign_jobs")
      .select(
        "campaign_id, referral_campaigns(id, name, status, launched_at, ended_at, updated_at)",
      )
      .eq("job_id", jobId)
      .eq("organisation_id", ctx.organisationId);
    if (linkErr) throw linkErr;

    const campaigns = (links ?? [])
      .map((row) => {
        const raw = (
          row as { referral_campaigns?: Record<string, unknown> | Record<string, unknown>[] }
        ).referral_campaigns;
        const c = Array.isArray(raw) ? raw[0] : raw;
        if (!c) return null;
        return {
          id: c.id as string,
          name: c.name as string,
          status: c.status as string,
          launched_at: (c.launched_at as string | null) ?? null,
          ended_at: (c.ended_at as string | null) ?? null,
          updated_at: c.updated_at as string,
        };
      })
      .filter((c): c is NonNullable<typeof c> => Boolean(c));

    if (campaigns.length === 0) {
      return jsonSuccess({ active: [], recentlyEnded: [] });
    }

    const active: Array<Record<string, unknown>> = [];
    const recentlyEnded: Array<Record<string, unknown>> = [];

    for (const campaign of campaigns) {
      const metricsPayload = await buildCampaignMetrics(admin, campaign.id, ctx.organisationId);
      const metrics = metricsPayload?.metrics ?? null;
      const row = {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        launched_at: campaign.launched_at,
        ended_at: campaign.ended_at,
        metrics,
      };
      if (campaign.status === "active") {
        active.push(row);
      } else if (
        campaign.status === "ended" &&
        (campaign.ended_at ?? campaign.updated_at) >= thirtyDaysAgo
      ) {
        recentlyEnded.push(row);
      }
    }

    return jsonSuccess({ active, recentlyEnded });
  } catch (err) {
    return handleApiError(err, "Failed to load job referral campaigns", {
      route: "GET /api/jobs/[id]/referral-campaigns",
    });
  }
}

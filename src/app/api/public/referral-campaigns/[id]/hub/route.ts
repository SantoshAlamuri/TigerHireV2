import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { handleApiError, jsonError, jsonSuccess } from "@/lib/api-helpers";
import {
  buildReferralLinkForCampaignSend,
  loadCampaignMessageContext,
} from "@/lib/referrers/campaigns";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: campaignId } = await params;
    const ref = new URL(request.url).searchParams.get("ref")?.trim();
    if (!ref) return jsonError("Missing ref token", 400);

    const admin = createSupabaseAdmin();
    const { data: linkRow, error: linkErr } = await admin
      .from("referral_links")
      .select("referrer_id")
      .eq("token", ref)
      .maybeSingle();
    if (linkErr) throw linkErr;
    if (!linkRow?.referrer_id) return jsonError("Invalid referral link", 404);
    const referrerId = linkRow.referrer_id as string;

    const { data: campaign, error: campErr } = await admin
      .from("referral_campaigns")
      .select("id, name, organisation_id, status")
      .eq("id", campaignId)
      .maybeSingle();
    if (campErr) throw campErr;
    if (!campaign) return jsonError("Campaign not found", 404);

    const ctx = await loadCampaignMessageContext(
      admin,
      campaignId,
      campaign.organisation_id as string,
    );
    if (!ctx) return jsonError("Campaign has no jobs", 404);

    const jobs = await Promise.all(
      ctx.jobs.map(async (job) => ({
        job_id: job.jobId,
        job_title: job.jobTitle,
        apply_url: await buildReferralLinkForCampaignSend(
          admin,
          referrerId,
          job.jobId,
          ctx.organisationSlug,
        ),
      })),
    );

    return jsonSuccess({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
      },
      company_name: ctx.companyName,
      jobs,
    });
  } catch (err) {
    return handleApiError(err, "Failed to load referral campaign hub", {
      route: "GET /api/public/referral-campaigns/[id]/hub",
    });
  }
}

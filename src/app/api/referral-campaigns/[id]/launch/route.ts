import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  handleApiError,
  handleZodError,
  jsonError,
  jsonSuccess,
  parseJsonBody,
  requireAuth,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { enqueue } from "@/lib/jobs/queue";
import { assertCanManageReferralCampaigns, createCampaignEvent } from "@/lib/referrers/campaigns";
import {
  executeCampaignLaunch,
  loadCampaignForLaunch,
  shouldScheduleCampaignLaunch,
  validateCampaignLaunchWindow,
} from "@/lib/referrers/campaign-launch";

const launchSchema = z.object({
  batchSize: z.number().int().min(1).max(200).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const { id } = await params;
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);
    if (!assertCanManageReferralCampaigns(ctx.role)) return jsonError("Forbidden", 403);

    const { body, errorResponse } = await parseJsonBody(
      request,
      "POST /api/referral-campaigns/[id]/launch",
    );
    if (errorResponse) return errorResponse;
    const parsed = launchSchema.safeParse(body ?? {});
    if (!parsed.success) return handleZodError(parsed.error);

    const admin = createSupabaseAdmin();
    const campaign = await loadCampaignForLaunch(admin, id, ctx.organisationId);
    if (!campaign) return jsonError("Campaign not found", 404);
    if (campaign.status === "ended") return jsonError("Ended campaigns cannot be relaunched", 409);

    const window = validateCampaignLaunchWindow(campaign);
    if (!window.ok) return jsonError(window.error, 400);

    const schedule = shouldScheduleCampaignLaunch(campaign);
    if (schedule.scheduled && schedule.launchesAt) {
      await createCampaignEvent(admin, {
        campaignId: id,
        organisationId: ctx.organisationId,
        eventType: "launch_scheduled",
        eventPayload: {
          launchesAt: schedule.launchesAt,
          launchedBy: ctx.userId,
        },
      });
      const queueResult = await enqueue(
        "referral-campaign-scheduled-launch",
        {
          campaignId: id,
          organisationId: ctx.organisationId,
          userId: ctx.userId,
          batchSize: parsed.data.batchSize ?? 25,
          launchesAt: schedule.launchesAt,
        },
        { id: `referral-campaign-scheduled-launch:${id}` },
      );
      return jsonSuccess({
        campaign_id: id,
        scheduled: true,
        launches_at: schedule.launchesAt,
        queued: Boolean(queueResult.id),
        queue_id: queueResult.id ?? null,
      });
    }

    const upsertSummary = await executeCampaignLaunch(admin, {
      campaignId: id,
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      audienceFilter: campaign.audience_filter,
      objective: campaign.objective,
    });

    const queueResult = await enqueue(
      "referral-campaign-send",
      {
        campaignId: id,
        organisationId: ctx.organisationId,
        batchSize: parsed.data.batchSize ?? 25,
      },
      { id: `referral-campaign-send:${id}:${Date.now()}` },
    );

    return jsonSuccess({
      campaign_id: id,
      ...upsertSummary,
      queued: Boolean(queueResult.id),
      queue_id: queueResult.id ?? null,
    });
  } catch (err) {
    return handleApiError(err, "Failed to launch referral campaign", {
      route: "POST /api/referral-campaigns/[id]/launch",
    });
  }
}

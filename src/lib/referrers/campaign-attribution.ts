import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import { createCampaignEvent, type ReferralCampaignEventType } from "@/lib/referrers/campaigns";

export async function resolveActiveCampaignForReferral(
  admin: SupabaseClient,
  input: { referrerId: string; jobId: string },
): Promise<{ campaignId: string; organisationId: string; recipientId: string } | null> {
  const { data: recipientRows, error } = await admin
    .from("referral_campaign_recipients")
    .select("id, campaign_id, organisation_id, referral_campaigns!inner(id, status)")
    .eq("referrer_id", input.referrerId)
    .eq("status", "sent")
    .order("updated_at", { ascending: false });
  if (error) throw error;

  for (const row of recipientRows ?? []) {
    const campaign = (
      row as {
        referral_campaigns?: { id: string; status: string } | { id: string; status: string }[];
      }
    ).referral_campaigns;
    const campaignRow = Array.isArray(campaign) ? campaign[0] : campaign;
    if (!campaignRow || campaignRow.status !== "active") continue;

    const campaignId = (row as { campaign_id: string }).campaign_id;
    const { data: jobLink } = await admin
      .from("referral_campaign_jobs")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("job_id", input.jobId)
      .maybeSingle();
    if (!jobLink) continue;

    return {
      campaignId,
      organisationId: (row as { organisation_id: string }).organisation_id,
      recipientId: (row as { id: string }).id,
    };
  }
  return null;
}

export async function attributeApplicationToCampaign(
  admin: SupabaseClient,
  input: {
    applicationId: string;
    referrerId: string;
    jobId: string;
  },
): Promise<string | null> {
  const match = await resolveActiveCampaignForReferral(admin, {
    referrerId: input.referrerId,
    jobId: input.jobId,
  });
  if (!match) return null;

  const { error } = await admin
    .from("applications")
    .update({ referral_campaign_id: match.campaignId })
    .eq("id", input.applicationId)
    .is("referral_campaign_id", null);
  if (error) throw error;

  await createCampaignEvent(admin, {
    campaignId: match.campaignId,
    organisationId: match.organisationId,
    eventType: "application_attributed",
    recipientId: match.recipientId,
    referrerId: input.referrerId,
    jobId: input.jobId,
    eventPayload: { applicationId: input.applicationId },
  });

  return match.campaignId;
}

const STATUS_TO_EVENT: Partial<Record<string, ReferralCampaignEventType>> = {
  shortlisted: "shortlisted_attributed",
  hired: "hire_attributed",
};

export async function recordCampaignStatusAttribution(
  admin: SupabaseClient,
  input: { applicationId: string; status: string },
): Promise<void> {
  const eventType = STATUS_TO_EVENT[input.status];
  if (!eventType) return;

  const { data: app, error } = await admin
    .from("applications")
    .select("id, job_id, direct_referrer_id, referral_campaign_id")
    .eq("id", input.applicationId)
    .maybeSingle();
  if (error) throw error;
  if (!app?.referral_campaign_id || !app.direct_referrer_id) return;

  const { data: campaign } = await admin
    .from("referral_campaigns")
    .select("organisation_id")
    .eq("id", app.referral_campaign_id as string)
    .maybeSingle();
  if (!campaign) return;

  await createCampaignEvent(admin, {
    campaignId: app.referral_campaign_id as string,
    organisationId: campaign.organisation_id as string,
    eventType,
    referrerId: app.direct_referrer_id as string,
    jobId: app.job_id as string,
    eventPayload: { applicationId: input.applicationId, status: input.status },
  });
}

export function enqueueCampaignAttribution(payload: {
  applicationId: string;
  referrerId: string;
  jobId: string;
}): void {
  void (async () => {
    try {
      const { enqueue } = await import("@/lib/jobs/queue");
      await enqueue("referral-campaign-attribute", payload, {
        id: `referral-campaign-attribute:${payload.applicationId}`,
      });
    } catch (err) {
      logger.warn("Failed to enqueue referral campaign attribution", {
        applicationId: payload.applicationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();
}

export function enqueueCampaignStatusAttribution(payload: {
  applicationId: string;
  status: string;
}): void {
  void (async () => {
    try {
      const { enqueue } = await import("@/lib/jobs/queue");
      await enqueue("referral-campaign-status-attribute", payload, {
        id: `referral-campaign-status-attribute:${payload.applicationId}:${payload.status}`,
      });
    } catch (err) {
      logger.warn("Failed to enqueue referral campaign status attribution", {
        applicationId: payload.applicationId,
        status: payload.status,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();
}

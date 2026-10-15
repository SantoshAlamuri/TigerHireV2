import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createCampaignEvent,
  getCampaignById,
  upsertCampaignRecipients,
  type ReferralCampaignAudienceFilter,
  type ReferralCampaignObjective,
} from "@/lib/referrers/campaigns";

export function validateCampaignLaunchWindow(campaign: {
  starts_at: string | null;
  ends_at: string | null;
}): { ok: true } | { ok: false; error: string } {
  const now = Date.now();
  if (campaign.ends_at && new Date(campaign.ends_at).getTime() <= now) {
    return { ok: false, error: "Campaign end date has passed" };
  }
  return { ok: true };
}

export function shouldScheduleCampaignLaunch(campaign: { starts_at: string | null }): {
  scheduled: boolean;
  launchesAt: string | null;
} {
  if (!campaign.starts_at) return { scheduled: false, launchesAt: null };
  const startsMs = new Date(campaign.starts_at).getTime();
  if (startsMs <= Date.now()) return { scheduled: false, launchesAt: null };
  return { scheduled: true, launchesAt: campaign.starts_at };
}

export async function executeCampaignLaunch(
  admin: SupabaseClient,
  input: {
    campaignId: string;
    organisationId: string;
    userId: string;
    batchSize?: number;
    audienceFilter: ReferralCampaignAudienceFilter;
    objective: ReferralCampaignObjective;
  },
) {
  const nowIso = new Date().toISOString();
  await createCampaignEvent(admin, {
    campaignId: input.campaignId,
    organisationId: input.organisationId,
    eventType: "launch_started",
    eventPayload: { launchedBy: input.userId },
  });

  const upsertSummary = await upsertCampaignRecipients(
    admin,
    input.campaignId,
    input.organisationId,
    input.audienceFilter,
    input.objective,
  );

  const existing = await getCampaignById(admin, input.campaignId, input.organisationId);

  const { error: updErr } = await admin
    .from("referral_campaigns")
    .update({
      status: "active",
      launched_at: existing?.launched_at ?? nowIso,
      ended_at: null,
      updated_at: nowIso,
      updated_by: input.userId,
    })
    .eq("id", input.campaignId)
    .eq("organisation_id", input.organisationId);
  if (updErr) throw updErr;

  await createCampaignEvent(admin, {
    campaignId: input.campaignId,
    organisationId: input.organisationId,
    eventType: "launch_completed",
    eventPayload: { ...upsertSummary, objective: input.objective },
  });

  return upsertSummary;
}

export async function autoEndExpiredCampaigns(admin: SupabaseClient): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data: rows, error } = await admin
    .from("referral_campaigns")
    .select("id, organisation_id")
    .eq("status", "active")
    .not("ends_at", "is", null)
    .lt("ends_at", nowIso);
  if (error) throw error;

  let ended = 0;
  for (const row of rows ?? []) {
    const campaignId = (row as { id: string }).id;
    const organisationId = (row as { organisation_id: string }).organisation_id;
    const { error: updErr } = await admin
      .from("referral_campaigns")
      .update({
        status: "ended",
        ended_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", campaignId)
      .eq("organisation_id", organisationId)
      .eq("status", "active");
    if (updErr) continue;

    await createCampaignEvent(admin, {
      campaignId,
      organisationId,
      eventType: "auto_ended",
      eventPayload: { endedAt: nowIso },
    });
    ended += 1;
  }
  return ended;
}

export async function loadCampaignForLaunch(
  admin: SupabaseClient,
  campaignId: string,
  organisationId: string,
) {
  return getCampaignById(admin, campaignId, organisationId);
}

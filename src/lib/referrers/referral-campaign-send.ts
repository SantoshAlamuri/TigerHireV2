import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sendReferralDrive,
  sendReferralDriveMulti,
  sendReferralDriveUrgent,
} from "@/lib/services/whatsapp";
import { ensureReferralToken } from "@/lib/referrers/referral-link-mint";
import {
  buildCampaignHubUrl,
  buildReferralLinkForCampaignSend,
  createCampaignEvent,
  formatCampaignJobTitles,
  loadCampaignMessageContext,
  resolveRecipientPhoneAndName,
} from "@/lib/referrers/campaigns";

type SendPayload = {
  campaignId: string;
  organisationId: string;
  batchSize: number;
};

const LOOP_DELAY_MS = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTemplateMissingError(error?: string): boolean {
  if (!error) return false;
  const s = error.toLowerCase();
  return s.includes("template") && (s.includes("not found") || s.includes("does not exist"));
}

async function sendCampaignMessage(input: {
  phone: string;
  firstName: string;
  companyName: string;
  jobTitlesSummary: string;
  hubUrl: string;
  objective: "more_referrals" | "urgent_role_fill";
  usedUrgentFallback?: boolean;
}) {
  const multi =
    input.objective === "urgent_role_fill"
      ? await sendReferralDriveUrgent({
          phone: input.phone,
          employeeName: input.firstName,
          companyName: input.companyName,
          rolesSummary: input.jobTitlesSummary,
          hubLink: input.hubUrl,
        })
      : await sendReferralDriveMulti({
          phone: input.phone,
          employeeName: input.firstName,
          companyName: input.companyName,
          rolesSummary: input.jobTitlesSummary,
          hubLink: input.hubUrl,
        });

  if (multi.success || !isTemplateMissingError(multi.error)) {
    return { ...multi, usedUrgentFallback: input.usedUrgentFallback ?? false };
  }

  return {
    success: false as const,
    error: multi.error,
    usedUrgentFallback: input.usedUrgentFallback ?? false,
    templateMissing: true,
  };
}

async function sendPerJobFallback(input: {
  admin: SupabaseClient;
  campaignId: string;
  organisationId: string;
  referrerId: string;
  recipient: { phone: string; firstName: string };
  messageCtx: NonNullable<Awaited<ReturnType<typeof loadCampaignMessageContext>>>;
  recipientRowId: string;
  attemptCount: number;
}) {
  let sentAny = false;
  let lastError: string | undefined;
  for (let i = 0; i < input.messageCtx.jobs.length; i += 1) {
    const job = input.messageCtx.jobs[i];
    if (i > 0) await sleep(LOOP_DELAY_MS);
    const referralLink = await buildReferralLinkForCampaignSend(
      input.admin,
      input.referrerId,
      job.jobId,
      input.messageCtx.organisationSlug,
    );
    if (!referralLink) {
      lastError = "Could not build referral link";
      continue;
    }
    const out = await sendReferralDrive({
      phone: input.recipient.phone,
      employeeName: input.recipient.firstName,
      companyName: input.messageCtx.companyName,
      jobTitle: job.jobTitle,
      referralLink,
    });
    if (out.success) {
      sentAny = true;
    } else {
      lastError = out.error ?? "Send failed";
    }
  }
  return { sentAny, lastError };
}

export async function processReferralCampaignSend(admin: SupabaseClient, payload: SendPayload) {
  const campaignId = payload.campaignId;
  const organisationId = payload.organisationId;
  const batchSize = Math.max(1, Math.min(payload.batchSize || 25, 200));

  const { data: campaign, error: campaignErr } = await admin
    .from("referral_campaigns")
    .select("id, status, objective")
    .eq("id", campaignId)
    .eq("organisation_id", organisationId)
    .maybeSingle();
  if (campaignErr) throw campaignErr;
  if (!campaign) return { sent: 0, failed: 0, skipped: 0, pending: 0, halted: true };
  if ((campaign.status as string) !== "active") {
    return { sent: 0, failed: 0, skipped: 0, pending: 0, halted: true };
  }

  const messageCtx = await loadCampaignMessageContext(admin, campaignId, organisationId);
  if (!messageCtx || messageCtx.jobs.length === 0) {
    return { sent: 0, failed: 0, skipped: 0, pending: 0, halted: true };
  }

  const objective =
    (campaign.objective as "more_referrals" | "urgent_role_fill") ?? messageCtx.objective;

  let recipientQuery = admin
    .from("referral_campaign_recipients")
    .select("id, referrer_id, status, attempt_count")
    .eq("campaign_id", campaignId)
    .eq("organisation_id", organisationId)
    .in("status", ["pending", "failed"])
    .lt("attempt_count", 3);

  if (objective === "urgent_role_fill") {
    recipientQuery = recipientQuery.order("created_at", { ascending: true });
  } else {
    recipientQuery = recipientQuery.order("created_at", { ascending: true });
  }

  const { data: recipients, error: recipientErr } = await recipientQuery.limit(batchSize);
  if (recipientErr) throw recipientErr;

  const rows = (recipients ?? []) as Array<{
    id: string;
    referrer_id: string;
    status: string;
    attempt_count: number;
  }>;
  if (rows.length === 0) {
    const { count } = await admin
      .from("referral_campaign_recipients")
      .select("id", { head: true, count: "exact" })
      .eq("campaign_id", campaignId)
      .eq("organisation_id", organisationId)
      .in("status", ["pending", "failed"]);
    return { sent: 0, failed: 0, skipped: 0, pending: count ?? 0, halted: false };
  }

  const ids = rows.map((r) => r.id);
  const { error: queueErr } = await admin
    .from("referral_campaign_recipients")
    .update({ status: "queued", updated_at: new Date().toISOString() })
    .in("id", ids)
    .eq("campaign_id", campaignId)
    .eq("organisation_id", organisationId);
  if (queueErr) throw queueErr;

  const primaryJobId = messageCtx.jobs[0].jobId;
  const jobTitlesSummary = formatCampaignJobTitles(messageCtx.jobs);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    await createCampaignEvent(admin, {
      campaignId,
      organisationId,
      eventType: "send_attempted",
      recipientId: row.id,
      referrerId: row.referrer_id,
      jobId: primaryJobId,
      eventPayload: { attempt: row.attempt_count + 1, objective },
    });

    const recipient = await resolveRecipientPhoneAndName(admin, row.referrer_id);
    if (!recipient) {
      skipped += 1;
      await admin
        .from("referral_campaign_recipients")
        .update({
          status: "skipped",
          last_error: "Referrer phone missing",
          attempt_count: row.attempt_count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      continue;
    }

    const tokenOut = await ensureReferralToken(admin, row.referrer_id, primaryJobId);
    if (!tokenOut.token) {
      failed += 1;
      await admin
        .from("referral_campaign_recipients")
        .update({
          status: "failed",
          last_error: "Could not build referral link",
          attempt_count: row.attempt_count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      await createCampaignEvent(admin, {
        campaignId,
        organisationId,
        eventType: "send_failed",
        recipientId: row.id,
        referrerId: row.referrer_id,
        jobId: primaryJobId,
        eventPayload: { error: "Could not build referral link" },
      });
      continue;
    }

    const hubUrlFixed = buildCampaignHubUrl(campaignId, tokenOut.token);

    let sendOut = await sendCampaignMessage({
      phone: recipient.phone,
      firstName: recipient.firstName,
      companyName: messageCtx.companyName,
      jobTitlesSummary,
      hubUrl: hubUrlFixed,
      objective,
      usedUrgentFallback: objective === "urgent_role_fill",
    });

    let sendSucceeded = sendOut.success;
    let sendError = sendOut.success ? undefined : sendOut.error;
    let messageId = sendOut.success ? sendOut.messageId : undefined;

    if (!sendSucceeded && "templateMissing" in sendOut && sendOut.templateMissing) {
      const fallback = await sendPerJobFallback({
        admin,
        campaignId,
        organisationId,
        referrerId: row.referrer_id,
        recipient,
        messageCtx,
        recipientRowId: row.id,
        attemptCount: row.attempt_count,
      });
      sendSucceeded = fallback.sentAny;
      sendError = fallback.lastError ?? "Send failed";
      messageId = undefined;
    }

    if (!sendSucceeded) {
      failed += 1;
      await admin
        .from("referral_campaign_recipients")
        .update({
          status: "failed",
          last_error: sendError ?? "Send failed",
          attempt_count: row.attempt_count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      await createCampaignEvent(admin, {
        campaignId,
        organisationId,
        eventType: "send_failed",
        recipientId: row.id,
        referrerId: row.referrer_id,
        jobId: primaryJobId,
        eventPayload: {
          error: sendError ?? "Send failed",
          objective,
          usedUrgentFallback:
            "usedUrgentFallback" in sendOut ? sendOut.usedUrgentFallback : undefined,
        },
      });
      continue;
    }

    sent += 1;
    await admin
      .from("referral_campaign_recipients")
      .update({
        status: "sent",
        last_error: null,
        attempt_count: row.attempt_count + 1,
        last_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    await createCampaignEvent(admin, {
      campaignId,
      organisationId,
      eventType: "send_succeeded",
      recipientId: row.id,
      referrerId: row.referrer_id,
      jobId: primaryJobId,
      eventPayload: {
        messageId: messageId ?? null,
        jobCount: messageCtx.jobs.length,
        objective,
      },
    });
  }

  const { count: pending } = await admin
    .from("referral_campaign_recipients")
    .select("id", { head: true, count: "exact" })
    .eq("campaign_id", campaignId)
    .eq("organisation_id", organisationId)
    .in("status", ["pending", "failed"]);

  return { sent, failed, skipped, pending: pending ?? 0, halted: false };
}

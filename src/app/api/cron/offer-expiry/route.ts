import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { validateCronSecret } from "@/lib/security/cron-auth";
import { logger } from "@/lib/observability/logger";
import { insertOfferEvent } from "@/lib/offers/offer-events";
import {
  sendNativeOfferExpiredRecruiterEmail,
  sendNativeOfferReminderCandidateEmail,
} from "@/lib/offers/offer-native-notifications";

/**
 * GET /api/cron/offer-expiry
 * - Reminder: sent/viewed offers expiring within 48h, no reminder in last 24h.
 * - Expiry: sent offers past expires_at → expired + recruiter notice.
 */
export async function GET(request: NextRequest) {
  if (!(await validateCronSecret(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdmin();
  const now = new Date();
  const nowIso = now.toISOString();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  let reminders = 0;
  let expired = 0;

  const { data: reminderCandidates, error: rErr } = await admin
    .from("offers")
    .select(
      "id, role_title, expires_at, public_token, signing_status, last_signing_reminder_at, organisation_id, applications(candidate_id)",
    )
    .eq("status", "sent")
    .gt("expires_at", nowIso)
    .lte("expires_at", in48h)
    .or("signing_status.is.null,signing_status.eq.sent,signing_status.eq.viewed");

  if (rErr) {
    logger.error("Offer expiry cron: reminder query failed", { error: String(rErr.message) });
  } else {
    for (const row of reminderCandidates ?? []) {
      const last = row.last_signing_reminder_at as string | null;
      if (last && new Date(last).getTime() > new Date(ago24h).getTime()) {
        continue;
      }
      const token = row.public_token as string | null;
      const exp = row.expires_at as string | null;
      if (!token || !exp) continue;

      const apps = row.applications as { candidate_id?: string } | null;
      const cid = apps?.candidate_id as string | undefined;
      if (!cid) continue;

      const { data: cand } = await admin
        .from("candidates")
        .select("email, name, full_name")
        .eq("id", cid)
        .maybeSingle();
      const candidateEmail = ((cand?.email as string | null) ?? "").trim();
      if (!candidateEmail) continue;

      const { data: orgRow } = await admin
        .from("organisations")
        .select("name")
        .eq("id", row.organisation_id as string)
        .maybeSingle();
      const companyName = (orgRow?.name as string | null) ?? "Your organisation";
      const candidateDisplay =
        ((cand?.full_name as string | null) ?? "").trim() ||
        ((cand?.name as string | null) ?? "").trim() ||
        "Candidate";

      const hoursRemaining = (new Date(exp).getTime() - now.getTime()) / 3600000;

      // Stamp the dedupe marker BEFORE sending. If the stamp fails we skip the
      // send this cycle rather than emailing and then failing to record it —
      // that was re-sending a reminder every 6h until expiry. A rare missed
      // reminder is preferable to spamming the candidate.
      const { error: stampErr } = await admin
        .from("offers")
        .update({ last_signing_reminder_at: nowIso })
        .eq("id", row.id as string);
      if (stampErr) {
        logger.error("Offer expiry cron: reminder stamp failed — skipping send to avoid spam", {
          offerId: row.id as string,
          error: stampErr.message,
        });
        continue;
      }

      await sendNativeOfferReminderCandidateEmail({
        candidateEmail,
        candidateName: candidateDisplay,
        roleTitle: row.role_title as string,
        companyName,
        publicToken: token,
        hoursRemaining,
      });

      await insertOfferEvent(admin, {
        offerId: row.id as string,
        eventType: "reminder_sent",
        metadata: { source: "cron_6h" },
      });
      reminders += 1;
    }
  }

  const { data: expiringRows, error: eListErr } = await admin
    .from("offers")
    .select(
      "id, role_title, expires_at, organisation_id, created_by, signing_status, applications(candidate_id)",
    )
    .eq("status", "sent")
    .lt("expires_at", nowIso);

  if (eListErr) {
    logger.error("Offer expiry cron: expire list failed", { error: String(eListErr.message) });
    return NextResponse.json({ error: "Failed to list expiring offers" }, { status: 500 });
  }

  for (const row of expiringRows ?? []) {
    const sg = row.signing_status as string | null;
    if (sg === "signed" || sg === "declined" || sg === "expired" || sg === "withdrawn") {
      continue;
    }

    const { error: upErr } = await admin
      .from("offers")
      .update({
        status: "expired",
        signing_status: "expired",
        expired_at: nowIso,
      })
      .eq("id", row.id as string)
      .eq("status", "sent");

    if (upErr) {
      logger.warn("Offer expiry cron: single update failed", {
        offerId: row.id,
        error: upErr.message,
      });
      continue;
    }

    await insertOfferEvent(admin, {
      offerId: row.id as string,
      eventType: "expired",
      metadata: { source: "cron_6h" },
    });

    const apps = row.applications as { candidate_id?: string } | null;
    const cid = apps?.candidate_id as string | undefined;
    let candidateDisplay = "Candidate";
    if (cid) {
      const { data: cand } = await admin
        .from("candidates")
        .select("name, full_name")
        .eq("id", cid)
        .maybeSingle();
      candidateDisplay =
        ((cand?.full_name as string | null) ?? "").trim() ||
        ((cand?.name as string | null) ?? "").trim() ||
        "Candidate";
    }

    await sendNativeOfferExpiredRecruiterEmail(admin, {
      createdByProfileId: (row.created_by as string | null) ?? null,
      candidateName: candidateDisplay,
      roleTitle: row.role_title as string,
    });
    expired += 1;
  }

  const { data: deletedApprovalTokens, error: approvalTokErr } = await admin
    .from("approval_tokens")
    .delete()
    .lt("expires_at", nowIso)
    .is("used_at", null)
    .select("id");

  if (approvalTokErr) {
    logger.warn("Offer expiry cron: approval_tokens cleanup failed", {
      error: String(approvalTokErr.message),
    });
  } else {
    const n = (deletedApprovalTokens ?? []).length;
    if (n > 0) {
      logger.info("Offer expiry cron: deleted expired unused approval_tokens", { count: n });
    }
  }

  return NextResponse.json({
    reminders,
    expired,
    approvalTokensDeleted: (deletedApprovalTokens ?? []).length,
    message: "Offer expiry cron completed",
  });
}

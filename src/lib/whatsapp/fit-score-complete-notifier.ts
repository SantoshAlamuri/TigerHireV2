import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sendThJobMatchResult,
  sendThJobNoMatch,
  sendWhatsAppMessage,
} from "@/lib/services/whatsapp";
import { logger } from "@/lib/observability/logger";
import { FITSCORE_MIN_THRESHOLD } from "./constants";

type CandidateRow = {
  phone?: string | null;
  name?: string | null;
  full_name?: string | null;
};

type JobRow = {
  title?: string | null;
  location?: string | null;
  organisations?: { name?: string | null } | { name?: string | null }[] | null;
};

type FitScoreRow = {
  overall_score?: number | null;
  band?: string | null;
  verdict?: string | null;
};

type ApplicationRow = {
  id?: string | null;
  source?: string | null;
  direct_referrer_id?: string | null;
  parent_referrer_id?: string | null;
  referral_link_id?: string | null;
};

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function firstName(candidate: CandidateRow | null): string {
  const name = (candidate?.name ?? candidate?.full_name ?? "").trim();
  return name.split(/\s+/)[0] || "there";
}

function hasReferralContext(application: ApplicationRow | null): boolean {
  return Boolean(
    application?.direct_referrer_id ||
    application?.parent_referrer_id ||
    application?.referral_link_id ||
    application?.source === "referral",
  );
}

export async function notifyWhatsAppFitScoreComplete(
  supabase: SupabaseClient,
  params: { jobId: string; candidateId: string },
): Promise<{ sent: boolean; skipped?: string }> {
  const results = await Promise.all([
    supabase
      .from("candidates")
      .select("phone, name, full_name")
      .eq("id", params.candidateId)
      .maybeSingle(),
    supabase
      .from("jobs")
      .select("title, location, organisations!jobs_organisation_id_fkey(name)")
      .eq("id", params.jobId)
      .maybeSingle(),
    supabase
      .from("fit_scores")
      .select("overall_score, band, verdict")
      .eq("candidate_id", params.candidateId)
      .eq("job_id", params.jobId)
      .or("is_test_run.eq.false,is_test_run.is.null")
      .is("superseded_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("applications")
      .select("id, source, direct_referrer_id, parent_referrer_id, referral_link_id")
      .eq("candidate_id", params.candidateId)
      .eq("job_id", params.jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (results.some((result) => result.error)) {
    logger.warn("fitscore_complete_notification_read_failed", {
      jobId: params.jobId,
      candidateId: params.candidateId,
    });
    return { sent: false, skipped: "notification_data_unavailable" };
  }
  const [{ data: candidate }, { data: job }, { data: score }, { data: application }] = results;

  const candidateRow = candidate as CandidateRow | null;
  const phone = candidateRow?.phone?.trim();
  if (!phone) return { sent: false, skipped: "candidate_phone_missing" };

  const jobRow = job as JobRow | null;
  const org = unwrapOne(jobRow?.organisations);
  const title = jobRow?.title?.trim() || "the role";
  const location = jobRow?.location?.trim() || "the listed location";
  const companyName = org?.name?.trim() || "the company";
  const scoreRow = score as FitScoreRow | null;
  const scoreValue = Number(scoreRow?.overall_score ?? 0);
  const name = firstName(candidateRow);
  const referralLine = hasReferralContext(application as ApplicationRow | null)
    ? "\n\nYour referral context is attached to this application, so the recruiter can see where it came from."
    : "";

  if (!scoreRow) {
    const result = await sendWhatsAppMessage(
      phone,
      `Hi ${name}, your application for *${title}* at ${companyName} is still under recruiter review. We could not produce a reliable FitScore yet, so the team will review your profile manually.${referralLine}\n\nReply STATUS anytime for updates.`,
    );
    return result.success ? { sent: true } : { sent: false, skipped: result.error };
  }

  const verdict = (scoreRow.band ?? scoreRow.verdict ?? "See TigerHire").slice(0, 120);
  const templateResult =
    scoreValue >= FITSCORE_MIN_THRESHOLD
      ? await sendThJobMatchResult({ phone, name, title, location, score: scoreValue, verdict })
      : await sendThJobNoMatch({ phone, name, title });

  const nextSteps =
    scoreValue >= FITSCORE_MIN_THRESHOLD
      ? `Next step: the recruiter can now review your application for *${title}* at ${companyName}. Reply STATUS for updates, MATCHES for other roles, or send a new CV anytime to refresh.`
      : `Next step: this role may not move forward, but your profile stays active for better-fit roles at ${companyName}. Reply MATCHES for other roles or send a new CV anytime to refresh.`;

  const followUp = await sendWhatsAppMessage(phone, `${nextSteps}${referralLine}`);
  if (!templateResult.success && !followUp.success) {
    logger.warn("notifyWhatsAppFitScoreComplete: WhatsApp sends failed", {
      jobId: params.jobId,
      candidateId: params.candidateId,
      templateError: templateResult.error,
      followUpError: followUp.error,
    });
    return { sent: false, skipped: followUp.error ?? templateResult.error };
  }

  return { sent: true };
}

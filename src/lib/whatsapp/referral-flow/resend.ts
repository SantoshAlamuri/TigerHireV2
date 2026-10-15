import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { withSessionCAS } from "../sessions";
import { normalizeIndianPhone } from "../normalize-phone";
import {
  findOrCreateReferralForTarget,
  handleReferralCandidatePhone,
  resolveOrCreateReferrerIdentityForFlow,
} from "../referral-handler";
import { extractPhoneFromMessage } from "./parsing";
import { readDraft } from "./draft";
import type { ReferralDraft, ReferrerProfile } from "./types";

async function buildReferralSessionContextForResend(
  referrerPhone: string,
  profile: ReferrerProfile,
  candidatePhone: string,
  candidateName: string,
  context: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const referralId =
    (typeof context.last_referral_id === "string" ? context.last_referral_id : null) ??
    (typeof context.referral_id === "string" ? context.referral_id : null);
  if (!referralId) return null;

  const resolvedReferrer = await resolveOrCreateReferrerIdentityForFlow(referrerPhone, profile);
  return {
    referral_id: referralId,
    candidate_name: candidateName,
    referrer_id: (context.referrer_id as string | undefined) ?? profile.id,
    referrer_name:
      (context.referrer_name as string | undefined) ?? profile.full_name ?? "A referrer",
    referrer_referrers_id: resolvedReferrer.directReferrerId,
    parent_referrer_id: resolvedReferrer.parentReferrerId,
    resend_outreach: true,
  };
}

export async function resendReferralOutreach(
  referrerPhone: string,
  profile: ReferrerProfile,
  candidatePhone: string,
  context: Record<string, unknown>,
): Promise<void> {
  const draft = readDraft(context);
  const name =
    (typeof context.last_referred_candidate_name === "string"
      ? context.last_referred_candidate_name
      : null) ??
    draft.candidate_name ??
    "your friend";
  const sessionContext = await buildReferralSessionContextForResend(
    referrerPhone,
    profile,
    candidatePhone,
    name,
    context,
  );
  if (!sessionContext) {
    await sendWhatsAppMessage(
      referrerPhone,
      "Start a referral first (reply REFER), then use RESEND followed by their 10-digit number to send the invite again.",
    );
    return;
  }
  await handleReferralCandidatePhone(referrerPhone, candidatePhone, sessionContext);
}

export async function handleReferralStatusOrResendRequest(
  referrerPhone: string,
  profile: ReferrerProfile,
  text: string,
  context: Record<string, unknown>,
  draft: ReferralDraft,
): Promise<boolean> {
  const phone =
    extractPhoneFromMessage(text) ??
    draft.candidate_phone ??
    (typeof context.last_referred_candidate_phone === "string"
      ? context.last_referred_candidate_phone
      : null);

  if (phone) {
    await resendReferralOutreach(referrerPhone, profile, phone, context);
    return true;
  }

  const lastName =
    (typeof context.last_referred_candidate_name === "string"
      ? context.last_referred_candidate_name
      : null) ?? draft.candidate_name;
  if (lastName) {
    await sendWhatsAppMessage(
      referrerPhone,
      `To resend the WhatsApp invite to ${lastName}, reply RESEND followed by their 10-digit number (e.g. RESEND 7674911055).`,
    );
    return true;
  }

  await sendWhatsAppMessage(
    referrerPhone,
    "To resend an invite, reply RESEND and your friend's 10-digit WhatsApp number.",
  );
  return true;
}

export async function finalizeReferralFromDraft(
  referrerPhone: string,
  profile: ReferrerProfile,
  draft: ReferralDraft,
  context: Record<string, unknown>,
): Promise<void> {
  const supabase = createSupabaseAdmin();
  const candidatePhone = normalizeIndianPhone(draft.candidate_phone!);
  const candidateName = draft.candidate_name!.trim();

  let roleCategory =
    (typeof context.fast_path_role_category === "string"
      ? context.fast_path_role_category
      : null) ?? "general";
  let location = draft.location?.trim() ?? "";

  if (draft.job_id) {
    const { data: job } = await supabase
      .from("jobs")
      .select("title, location")
      .eq("id", draft.job_id)
      .maybeSingle();
    if (job) {
      roleCategory = String(job.title ?? roleCategory);
      location = String(job.location ?? location);
    }
  }

  const resolvedReferrer = await resolveOrCreateReferrerIdentityForFlow(referrerPhone, profile);

  const referralRow = await findOrCreateReferralForTarget({
    referrerId: profile.id,
    candidatePhone,
    roleCategory,
    location,
  });

  if (!referralRow?.id) {
    await sendWhatsAppMessage(referrerPhone, "Something went wrong. Please try again.");
    return;
  }

  const sessionContext: Record<string, unknown> = {
    referral_id: referralRow.id,
    candidate_name: candidateName,
    referrer_id: profile.id,
    referrer_name: profile.full_name ?? "A referrer",
    referrer_referrers_id: resolvedReferrer.directReferrerId,
    parent_referrer_id: resolvedReferrer.parentReferrerId,
    referral_draft: draft,
  };

  await withSessionCAS(referrerPhone, () => ({
    state: "referral_phone_requested",
    context: sessionContext,
  }));
  await handleReferralCandidatePhone(referrerPhone, candidatePhone, sessionContext);

  await withSessionCAS(referrerPhone, () => ({
    state: "referral_complete",
    context: {
      ...sessionContext,
      last_referred_candidate_name: candidateName,
      last_referred_candidate_phone: candidatePhone,
      last_referral_id: sessionContext.referral_id,
    },
  }));
}

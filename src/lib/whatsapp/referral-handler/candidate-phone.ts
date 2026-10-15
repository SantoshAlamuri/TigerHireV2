import { logger } from "@/lib/observability/logger";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { isEnabled } from "@/lib/feature-flags";
import { normalizeReferrerWhatsapp } from "@/lib/referrers/normalize-whatsapp";
import {
  isValidCanonicalIndianWhatsAppPhone,
  normalizeIndianPhone,
} from "@/lib/whatsapp/normalize-phone";
import { env } from "@/lib/config/env";
import { getOrCreateSession, withSessionCAS } from "@/lib/whatsapp/sessions";
import { getPublicWhatsAppChatUrl } from "@/lib/marketing/public-whatsapp";
import { hashPhoneForMetric, logReferralRateLimitedMetric } from "./metrics";
import { reachReferredCandidateOnWhatsApp } from "./reach";
import { REFERRAL_CONSENT_FLAG } from "./types";

/**
 * When referrer sends candidate's phone, create session for candidate with referral context and welcome them.
 */
export async function handleReferralCandidatePhone(
  referrerPhone: string,
  candidatePhoneRaw: string,
  sessionContext: Record<string, unknown>,
): Promise<void> {
  const candidatePhone = normalizeIndianPhone(
    normalizeReferrerWhatsapp(candidatePhoneRaw) || candidatePhoneRaw,
  );
  if (!isValidCanonicalIndianWhatsAppPhone(candidatePhone)) {
    await sendWhatsAppMessage(
      referrerPhone,
      `That doesn't look like a valid Indian mobile (need 10 digits starting 6–9, e.g. 9010255055). You sent: ${candidatePhoneRaw.trim()}`,
    );
    return;
  }
  const normalizedReferrerPhone = normalizeIndianPhone(normalizeReferrerWhatsapp(referrerPhone));
  const referralId = sessionContext.referral_id as string;
  const candidateName = (sessionContext.candidate_name as string) ?? "there";
  const referrerName = (sessionContext.referrer_name as string) ?? "someone";
  const referrerId = sessionContext.referrer_id as string;
  const directReferrerId = (sessionContext.referrer_referrers_id as string | undefined) ?? null;
  const parentReferrerId = (sessionContext.parent_referrer_id as string | undefined) ?? null;
  const identityKey = directReferrerId ?? normalizedReferrerPhone;
  const identityKind = directReferrerId ? "referrers_id" : "phone";

  const supabase = createSupabaseAdmin();
  if (candidatePhone === normalizedReferrerPhone) {
    logReferralRateLimitedMetric({
      reason: "self_referral_blocked",
      referrerIdentityKind: identityKind,
      referrerIdentityKey: identityKey,
      referrerPhone: normalizedReferrerPhone,
      candidatePhone,
      referralId,
    });
    await sendWhatsAppMessage(
      referrerPhone,
      "You can't refer your own number. Please share a different candidate WhatsApp number.",
    );
    return;
  }

  const { data: referral } = await supabase
    .from("referrals")
    .select("id, referrer_id")
    .eq("id", referralId)
    .single();

  if (!referral) {
    await sendWhatsAppMessage(referrerPhone, "Referral no longer valid. Please start again.");
    return;
  }
  let effectiveReferralId = referralId;
  let isDuplicateResend = false;
  const dedupWindowHours = env.referralTargetDedupWindowHours;
  if (dedupWindowHours > 0) {
    const windowStartIso = new Date(Date.now() - dedupWindowHours * 60 * 60 * 1000).toISOString();
    const dedupReferrerId = referrerId || ((referral.referrer_id as string | null) ?? null);
    if (dedupReferrerId) {
      const { data: duplicate } = await supabase
        .from("referrals")
        .select("id")
        .eq("referrer_id", dedupReferrerId)
        .eq("target_phone", candidatePhone)
        .gte("created_at", windowStartIso)
        .neq("id", referralId)
        .limit(1)
        .maybeSingle();
      if (duplicate?.id) {
        isDuplicateResend = true;
        effectiveReferralId = String(duplicate.id);
        logReferralRateLimitedMetric({
          reason: "duplicate_resend_outreach",
          referrerIdentityKind: identityKind,
          referrerIdentityKey: identityKey,
          referrerPhone: normalizedReferrerPhone,
          candidatePhone,
          referralId: effectiveReferralId,
        });
      }
    }
  }
  await supabase
    .from("referrals")
    .update({ target_phone: candidatePhone })
    .eq("id", effectiveReferralId);

  const candidateSession = await getOrCreateSession(candidatePhone);
  const candidateContext: Record<string, unknown> = {
    ...candidateSession.context,
    referred_by: referrerId,
    referrer_name: referrerName,
    referral_id: effectiveReferralId,
  };
  if (directReferrerId) {
    candidateContext.direct_referrer_id = directReferrerId;
    candidateContext.referrer_referrers_id = directReferrerId;
  }
  if (parentReferrerId) {
    candidateContext.parent_referrer_id = parentReferrerId;
  }

  const { data: referrerProfile } = await supabase
    .from("profiles")
    .select("organisation_id")
    .eq("id", referrerId)
    .maybeSingle();

  const useReferralConsentFlow = await isEnabled(
    REFERRAL_CONSENT_FLAG,
    (referrerProfile?.organisation_id as string | null) ?? null,
  );
  if (useReferralConsentFlow) {
    await withSessionCAS(candidatePhone, () => ({ state: "new", context: candidateContext }));
  }

  const reach = await reachReferredCandidateOnWhatsApp({
    supabase,
    candidatePhone,
    candidateName,
    referrerName,
    useReferralConsentFlow,
    candidateContext,
  });

  logger.info("metric.whatsapp_referred_candidate_consent_routed", {
    phone: candidatePhone,
    referral_id: effectiveReferralId,
    reached: reach.reached,
    via: reach.via,
    error: reach.error,
    duplicate_resend: isDuplicateResend,
  });

  const waMe = getPublicWhatsAppChatUrl("Hi");
  const displayPhone = candidatePhone.replace(/^91/, "");
  if (reach.reached) {
    const again = isDuplicateResend ? " again" : "";
    await sendWhatsAppMessage(
      referrerPhone,
      `We've submitted the WhatsApp invite to ${candidateName} (${displayPhone})${again}. You'll get another note if WhatsApp reports it could not be delivered. Reply APPLY to apply for jobs yourself, or send another name + number to refer someone else.`,
    );
  } else {
    const metaHint = reach.error ? ` Meta reported: ${reach.error.slice(0, 180)}.` : "";
    await sendWhatsAppMessage(
      referrerPhone,
      `We couldn't deliver a WhatsApp to ${candidateName} (${displayPhone}).${metaHint} Ask them to open this link on their phone, send Hi, then you RESEND ${displayPhone}: ${waMe}`,
    );
    logger.warn("referral outreach failed for referred candidate", {
      candidate_phone_hash: hashPhoneForMetric(candidatePhone),
      referral_id: effectiveReferralId,
      error: reach.error,
      via: reach.via,
      duplicate_resend: isDuplicateResend,
    });
  }
  await withSessionCAS(referrerPhone, () => ({
    state: "referral_complete",
    context: {
      ...(sessionContext ?? {}),
      last_referred_candidate_name: candidateName,
      last_referred_candidate_phone: candidatePhone,
      last_referral_id: effectiveReferralId,
      last_outreach_reached: reach.reached,
    },
  }));
}

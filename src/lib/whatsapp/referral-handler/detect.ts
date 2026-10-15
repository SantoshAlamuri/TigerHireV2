import { logger } from "@/lib/observability/logger";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { normalizeReferrerWhatsapp } from "@/lib/referrers/normalize-whatsapp";
import { env } from "@/lib/config/env";
import { withSessionCAS } from "@/lib/whatsapp/sessions";
import { hashPhoneForMetric, logReferralRateLimitedMetric } from "./metrics";
import { parseReferralText } from "./parse";
import { resolveOrCreateReferrerIdentityForFlow } from "./referrer-identity";
import { REFERRAL_DAILY_WINDOW_SECS } from "./types";

/**
 * Handle referrer message: create referral, ask for candidate phone.
 */
export async function detectAndHandleReferral(
  referrerPhone: string,
  messageText: string,
  _messageType: string,
): Promise<{ handled: boolean }> {
  const parsed = parseReferralText(messageText);
  if (!parsed) return { handled: false };

  const supabase = createSupabaseAdmin();
  const normalizedPhone = normalizeReferrerWhatsapp(referrerPhone);

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, organisation_id")
    .eq("phone", normalizedPhone)
    .single();

  if (!profile) {
    await sendWhatsAppMessage(
      referrerPhone,
      "Please register on tigerhire.io and add your WhatsApp number to refer candidates.",
    );
    return { handled: true };
  }

  const resolvedReferrer = await resolveOrCreateReferrerIdentityForFlow(normalizedPhone, {
    id: profile.id as string,
    full_name: (profile.full_name as string | null) ?? null,
    role: (profile.role as string | null) ?? null,
  });
  const dailyCap = env.referralDailyCap;
  const capIdentityKey = resolvedReferrer.directReferrerId ?? normalizedPhone;
  const capIdentityKind = resolvedReferrer.directReferrerId ? "referrers_id" : "phone";
  if (!resolvedReferrer.directReferrerId) {
    logger.warn("WhatsApp referral: daily cap using phone fallback identity", {
      profile_id: profile.id,
      referrer_phone_hash: hashPhoneForMetric(normalizedPhone),
    });
  }
  if (dailyCap > 0) {
    const cap = await checkRateLimit({
      key: `whatsapp-referral-daily:${capIdentityKey}`,
      limit: dailyCap,
      windowSecs: REFERRAL_DAILY_WINDOW_SECS,
    });
    if (!cap.allowed) {
      logReferralRateLimitedMetric({
        reason: "daily_cap_exceeded",
        referrerIdentityKind: capIdentityKind,
        referrerIdentityKey: capIdentityKey,
        referrerPhone: normalizedPhone,
      });
      await sendWhatsAppMessage(
        referrerPhone,
        "You've reached today's referral limit. Please try again tomorrow.",
      );
      return { handled: true };
    }
  }

  const { data: referral, error: refError } = await supabase
    .from("referrals")
    .insert({
      referrer_id: profile.id,
      role_category: parsed.roleCategory,
      location: parsed.location,
      status: "pending",
    })
    .select("id")
    .single();

  if (refError) {
    logger.error("Referral insert failed", { error: String(refError) });
    await sendWhatsAppMessage(referrerPhone, "Something went wrong. Please try again.");
    return { handled: true };
  }

  await sendWhatsAppMessage(
    referrerPhone,
    `Got it! We'll reach out to ${parsed.candidateName}. What is ${parsed.candidateName}'s WhatsApp number?`,
  );

  await withSessionCAS(referrerPhone, () => ({
    state: "referral_phone_requested",
    context: {
      referral_id: referral.id,
      candidate_name: parsed.candidateName,
      referrer_id: profile.id,
      referrer_name: profile.full_name ?? "A referrer",
      referrer_referrers_id: resolvedReferrer.directReferrerId,
      parent_referrer_id: resolvedReferrer.parentReferrerId,
    },
  }));
  logger.info("metric.whatsapp_referrer_resolved", {
    phone: normalizedPhone,
    direct_referrer_id: resolvedReferrer.directReferrerId,
    parent_referrer_id: resolvedReferrer.parentReferrerId,
  });

  return { handled: true };
}

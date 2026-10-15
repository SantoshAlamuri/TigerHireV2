import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { withSessionCAS } from "../sessions";
import {
  extractNameFromMessage,
  extractNameFromMessageIgnoringPhone,
  extractPhoneFromMessage,
  parseReferralFastPath,
} from "./parsing";
import { draftContext } from "./draft";
import { checkReferralDailyCap, greetReferrer } from "./session";
import { continueReferralFlow } from "./collect";
import type { ReferralDraft, ReferralInboundMessage, ReferrerProfile } from "./types";

export async function startReferralFlow(
  referrerPhone: string,
  profile: ReferrerProfile,
  message?: ReferralInboundMessage,
): Promise<void> {
  if (!(await checkReferralDailyCap(referrerPhone, profile))) return;

  const draft: ReferralDraft = {
    candidate_name: null,
    candidate_phone: null,
    candidate_cv_media_id: null,
    job_id: null,
    location: null,
  };

  const text = message?.type === "text" ? (message.text?.body ?? "").trim() : "";

  if (message?.type === "document") {
    const mediaId = message.document?.id ?? null;
    draft.candidate_cv_media_id = mediaId;
    await withSessionCAS(referrerPhone, () => ({
      state: "referral_collecting",
      context: {
        ...draftContext(draft, { next_field: "candidate_name" }),
        referrer_id: profile.id,
        referrer_name: profile.full_name ?? "A referrer",
      },
    }));
    await sendWhatsAppMessage(referrerPhone, "Got a CV! Who is this for — what's their name?");
    return;
  }

  const fast = text ? parseReferralFastPath(text) : null;
  if (fast?.candidateName) {
    draft.candidate_name = fast.candidateName;
    draft.location = fast.location || null;
    const phoneInText = extractPhoneFromMessage(text);
    if (phoneInText) draft.candidate_phone = phoneInText;

    await withSessionCAS(referrerPhone, () => ({
      state: "referral_collecting",
      context: {
        ...draftContext(draft, {
          next_field: draft.candidate_phone ? "job_id" : "candidate_phone",
          fast_path_role_category: fast.roleCategory,
          referrer_id: profile.id,
          referrer_name: profile.full_name ?? "A referrer",
        }),
        referrer_id: profile.id,
        referrer_name: profile.full_name ?? "A referrer",
      },
    }));

    if (draft.candidate_phone) {
      await continueReferralFlow(
        referrerPhone,
        profile,
        message ?? { from: referrerPhone, type: "text", text: { body: text } },
      );
      return;
    }
    await sendWhatsAppMessage(
      referrerPhone,
      `Got it — referring ${fast.candidateName}. What's ${fast.candidateName}'s WhatsApp number?`,
    );
    return;
  }

  const phone = text ? extractPhoneFromMessage(text) : null;
  if (phone) {
    draft.candidate_phone = phone;
    const nameFromSame = text ? extractNameFromMessageIgnoringPhone(text) : null;
    if (nameFromSame) draft.candidate_name = nameFromSame;

    await withSessionCAS(referrerPhone, () => ({
      state: "referral_collecting",
      context: {
        ...draftContext(draft, {
          next_field: draft.candidate_name ? "job_id" : "candidate_name",
          referrer_id: profile.id,
          referrer_name: profile.full_name ?? "A referrer",
        }),
        referrer_id: profile.id,
        referrer_name: profile.full_name ?? "A referrer",
      },
    }));

    if (draft.candidate_name) {
      await continueReferralFlow(
        referrerPhone,
        profile,
        message ?? { from: referrerPhone, type: "text", text: { body: text } },
      );
      return;
    }
    await sendWhatsAppMessage(referrerPhone, "Got it. What's this person's name?");
    return;
  }

  const name = text ? extractNameFromMessage(text) : null;
  if (name) {
    draft.candidate_name = name;
    await withSessionCAS(referrerPhone, () => ({
      state: "referral_collecting",
      context: {
        ...draftContext(draft, { next_field: "candidate_phone" }),
        referrer_id: profile.id,
        referrer_name: profile.full_name ?? "A referrer",
      },
    }));
    await sendWhatsAppMessage(referrerPhone, `What's ${name}'s WhatsApp number?`);
    return;
  }

  await withSessionCAS(referrerPhone, () => ({
    state: "referral_ready",
    context: {
      ...draftContext(draft),
      referrer_id: profile.id,
      referrer_name: profile.full_name ?? "A referrer",
    },
  }));
  await greetReferrer(referrerPhone, profile.full_name);
}

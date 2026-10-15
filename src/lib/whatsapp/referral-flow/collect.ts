import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { getOrCreateSession, withSessionCAS, type WhatsAppSession } from "../sessions";
import {
  extractNameFromMessage,
  extractPhoneFromMessage,
  isGenericReferralPlaceholderName,
  looksLikeReferralStatusOrResendText,
  parseApplyPrefillHints,
  parseReferralFastPath,
  parseResendReferralPhone,
} from "./parsing";
import { looksLikeApplyIntent } from "./intent";
import { draftContext, listOpenJobsForOrg, nextMissingField, readDraft } from "./draft";
import { askForField, switchToCandidateApplyFlow } from "./session";
import {
  finalizeReferralFromDraft,
  handleReferralStatusOrResendRequest,
  resendReferralOutreach,
} from "./resend";
import type { ReferralInboundMessage, ReferrerProfile } from "./types";

export async function continueReferralFlow(
  referrerPhone: string,
  profile: ReferrerProfile,
  message: ReferralInboundMessage,
  session?: WhatsAppSession,
): Promise<void> {
  const activeSession = session ?? (await getOrCreateSession(referrerPhone));
  const context = { ...(activeSession.context ?? {}) } as Record<string, unknown>;
  const draft = readDraft(context);
  if (draft.candidate_name && isGenericReferralPlaceholderName(draft.candidate_name)) {
    draft.candidate_name = null;
  }
  const jobs = await listOpenJobsForOrg(profile.organisation_id);
  const text = message.type === "text" ? (message.text?.body ?? "").trim() : "";

  if (text) {
    const resendPhone = parseResendReferralPhone(text);
    if (resendPhone) {
      await resendReferralOutreach(referrerPhone, profile, resendPhone, context);
      return;
    }
    if (looksLikeReferralStatusOrResendText(text)) {
      const handled = await handleReferralStatusOrResendRequest(
        referrerPhone,
        profile,
        text,
        context,
        draft,
      );
      if (handled) return;
    }
  }

  if (message.type === "document") {
    draft.candidate_cv_media_id = message.document?.id ?? draft.candidate_cv_media_id;
    if (!draft.candidate_name) {
      await withSessionCAS(referrerPhone, () => ({
        state: "referral_collecting",
        context: {
          ...draftContext(draft, { next_field: "candidate_name" }),
          ...context,
        },
      }));
      await sendWhatsAppMessage(referrerPhone, "Got a CV! Who is this for — what's their name?");
      return;
    }
  }

  if (text && looksLikeApplyIntent(text)) {
    const hints = parseApplyPrefillHints(text);
    await switchToCandidateApplyFlow(referrerPhone, context, {
      ...hints,
      reason: "referral_collecting_apply",
    });
    return;
  }

  const fast = text ? parseReferralFastPath(text) : null;
  if (fast?.candidateName) {
    draft.candidate_name = fast.candidateName;
    if (fast.location) draft.location = fast.location;
    const phoneInText = extractPhoneFromMessage(text);
    if (phoneInText) draft.candidate_phone = phoneInText;
    context.fast_path_role_category = fast.roleCategory;
  } else if (text) {
    const phone = extractPhoneFromMessage(text);
    if (phone && !draft.candidate_phone) {
      draft.candidate_phone = phone;
    } else if (!draft.candidate_name) {
      const name = extractNameFromMessage(text);
      if (name) draft.candidate_name = name;
      else if (/^\d+$/.test(text) && jobs.length > 0) {
        const idx = Number.parseInt(text, 10) - 1;
        if (idx >= 0 && idx < jobs.length) {
          draft.job_id = jobs[idx]!.id;
          draft.location = jobs[idx]!.location;
        }
      } else if (!draft.job_id && jobs.length > 0) {
        const idx = Number.parseInt(text, 10) - 1;
        if (!Number.isNaN(idx) && idx >= 0 && idx < jobs.length) {
          draft.job_id = jobs[idx]!.id;
          draft.location = jobs[idx]!.location;
        } else {
          const name = extractNameFromMessage(text);
          if (name) draft.candidate_name = name;
        }
      } else {
        const name = extractNameFromMessage(text);
        if (name) draft.candidate_name = name;
      }
    } else if (!draft.job_id && jobs.length > 0 && /^\d+$/.test(text)) {
      const idx = Number.parseInt(text, 10) - 1;
      if (idx >= 0 && idx < jobs.length) {
        draft.job_id = jobs[idx]!.id;
        draft.location = jobs[idx]!.location;
      }
    }
  }

  const missing = nextMissingField(draft, jobs.length);
  if (missing) {
    await withSessionCAS(referrerPhone, () => ({
      state: "referral_collecting",
      context: {
        ...context,
        ...draftContext(draft, { next_field: missing }),
      },
    }));
    await askForField(referrerPhone, missing, draft, jobs);
    return;
  }

  await finalizeReferralFromDraft(referrerPhone, profile, draft, context);
}

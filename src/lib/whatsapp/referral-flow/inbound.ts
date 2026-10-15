import { withSessionCAS, type WhatsAppSession } from "../sessions";
import { normalizeIndianPhone } from "../normalize-phone";
import { handleReferralCandidatePhone } from "../referral-handler";
import {
  extractNameFromMessage,
  extractPhoneFromMessage,
  looksLikeReferralStatusOrResendText,
  parseApplyPrefillHints,
  parseResendReferralPhone,
} from "./parsing";
import {
  EXPLICIT_APPLY_MENU_PATTERN,
  EXPLICIT_REFER_MENU_PATTERN,
  isAmbiguousRegisteredGreeting,
  isCandidateModeSession,
  isExplicitReferCommand,
  isReferralFlowState,
  isSessionIdleForReferral,
  looksLikeApplyIntent,
  looksLikeReferralAction,
} from "./intent";
import { readDraft } from "./draft";
import { hasProfileWithPhone, sendModeDisambiguation, switchToCandidateApplyFlow } from "./session";
import { startReferralFlow } from "./start";
import { continueReferralFlow } from "./collect";
import { handleReferralStatusOrResendRequest, resendReferralOutreach } from "./resend";
import type { ReferralInboundMessage, RegisteredReferralInboundResult } from "./types";

/**
 * Registered-user referral tree — runs before generic session dispatch.
 * Zero LLM calls; deterministic string matching + state machine.
 */
export async function handleRegisteredReferrerInbound(input: {
  referrerPhone: string;
  message: ReferralInboundMessage;
  messageType: string;
  session: WhatsAppSession;
}): Promise<RegisteredReferralInboundResult> {
  const normalizedPhone = normalizeIndianPhone(input.referrerPhone);
  const profile = await hasProfileWithPhone(normalizedPhone);
  if (!profile) return { handled: false };

  const text = input.message.type === "text" ? (input.message.text?.body ?? "").trim() : "";
  const state = input.session.session_state;
  const context = { ...(input.session.context ?? {}) } as Record<string, unknown>;

  if (input.message.type === "document" && context.pending_self_cv === true) {
    await withSessionCAS(input.referrerPhone, () => ({
      state: "cv_requested",
      context: {
        ...context,
        pending_self_cv: false,
        inbound_route: "apply_cv_after_switch",
      },
    }));
    return { handled: false };
  }

  if (text && looksLikeApplyIntent(text, { sessionState: state, context })) {
    const hints = parseApplyPrefillHints(text);
    await switchToCandidateApplyFlow(input.referrerPhone, context, {
      ...hints,
      reason: "registered_apply_intent",
    });
    return { handled: false };
  }

  if (text && isExplicitReferCommand(text)) {
    await startReferralFlow(input.referrerPhone, profile, input.message);
    return { handled: true };
  }

  if (context.awaiting_mode_choice === true && text) {
    if (EXPLICIT_REFER_MENU_PATTERN.test(text) || isExplicitReferCommand(text)) {
      await startReferralFlow(input.referrerPhone, profile, input.message);
      return { handled: true };
    }
    if (EXPLICIT_APPLY_MENU_PATTERN.test(text) || looksLikeApplyIntent(text)) {
      await withSessionCAS(input.referrerPhone, () => ({
        state,
        context: {
          ...context,
          awaiting_mode_choice: false,
          inbound_route: "registered_apply_intent",
        },
      }));
      return { handled: false };
    }
  }

  if (
    isCandidateModeSession(state) &&
    text &&
    (isExplicitReferCommand(text) ||
      (looksLikeReferralAction(input.message) && input.message.type !== "document"))
  ) {
    await startReferralFlow(input.referrerPhone, profile, input.message);
    return { handled: true };
  }

  if (isCandidateModeSession(state) && text && isAmbiguousRegisteredGreeting(text)) {
    await withSessionCAS(input.referrerPhone, () => ({
      state,
      context: {
        ...context,
        awaiting_mode_choice: true,
      },
    }));
    await sendModeDisambiguation(input.referrerPhone);
    return { handled: true };
  }

  if (isReferralFlowState(state)) {
    if (text && looksLikeApplyIntent(text, { sessionState: state, context })) {
      const hints = parseApplyPrefillHints(text);
      await switchToCandidateApplyFlow(input.referrerPhone, context, {
        ...hints,
        reason: "referral_flow_apply",
      });
      return { handled: false };
    }
    await continueReferralFlow(input.referrerPhone, profile, input.message, input.session);
    return { handled: true };
  }

  if (
    (state === "referral_complete" || state === "referral_phone_requested") &&
    text &&
    (looksLikeReferralStatusOrResendText(text) || parseResendReferralPhone(text))
  ) {
    const draft = readDraft(context);
    const resendPhone = parseResendReferralPhone(text);
    if (resendPhone) {
      await resendReferralOutreach(input.referrerPhone, profile, resendPhone, context);
      return { handled: true };
    }
    await handleReferralStatusOrResendRequest(input.referrerPhone, profile, text, context, draft);
    return { handled: true };
  }

  const referralFollowUpText =
    Boolean(text) &&
    !looksLikeApplyIntent(text) &&
    (looksLikeReferralAction(input.message) ||
      Boolean(extractPhoneFromMessage(text)) ||
      Boolean(extractNameFromMessage(text)));

  const shouldStartReferral =
    (isSessionIdleForReferral(state) &&
      text &&
      !looksLikeApplyIntent(text) &&
      looksLikeReferralAction(input.message)) ||
    (state === "referral_phone_requested" && looksLikeReferralAction(input.message)) ||
    (state === "cv_requested" &&
      text &&
      !looksLikeApplyIntent(text) &&
      (isExplicitReferCommand(text) || looksLikeReferralAction(input.message))) ||
    (state === "referral_complete" && referralFollowUpText);

  if (shouldStartReferral) {
    await startReferralFlow(input.referrerPhone, profile, input.message);
    return { handled: true };
  }

  if (state === "referral_complete" && input.message.type === "document") {
    await switchToCandidateApplyFlow(input.referrerPhone, context, {
      reason: "referral_complete_self_cv",
    });
    return { handled: false };
  }

  if (state === "referral_phone_requested") {
    const phone =
      text && (/^91[6-9]\d{9}$/.test(normalizeIndianPhone(text)) || extractPhoneFromMessage(text))
        ? (extractPhoneFromMessage(text) ?? normalizeIndianPhone(text))
        : null;
    if (phone) {
      await handleReferralCandidatePhone(input.referrerPhone, phone, input.session.context ?? {});
      return { handled: true };
    }
  }

  return { handled: false };
}

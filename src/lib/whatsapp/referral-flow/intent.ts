import { isCandidateIntentText } from "../inbound-intent";
import { resolveRolePickPhase } from "../role-pick-routing";
import type { WhatsAppSessionState } from "../sessions";
import type { ApplyIntentContext, ReferralInboundMessage } from "./types";
import {
  extractPhoneFromMessage,
  looksLikeSelfApply,
  parseReferralFastPath,
  REFERRAL_KEYWORD_PATTERN,
} from "./parsing";

const REFERRAL_IDLE_STATES = new Set<WhatsAppSessionState>([
  "new",
  "referral_complete",
  "business_inquiry",
]);

/** Explicit one-word commands (disambiguation menu). */
const EXPLICIT_APPLY_PATTERN = /^(apply|job|jobs)$/i;
const EXPLICIT_REFER_PATTERN = /^(refer|referral|2)$/i;
export const EXPLICIT_APPLY_MENU_PATTERN = /^1$/;
export const EXPLICIT_REFER_MENU_PATTERN = /^2$/;

/** States where 1/2/3 pick a role category, job, or FitScore match — not APPLY/REFER. */
const ROLE_NUMERIC_PICKER_STATES = new Set<WhatsAppSessionState>([
  "role_family_selection",
  "role_job_selection",
  "scored",
]);

function isRoleNumericPickerReply(text: string, opts?: ApplyIntentContext): boolean {
  const t = (text ?? "").trim();
  if (!/^\d+$/.test(t)) return false;
  // Registered disambiguation menu: 1 = apply, 2 = refer.
  if (opts?.context?.awaiting_mode_choice === true) return false;

  const state = opts?.sessionState;
  if (!state) return false;

  if (ROLE_NUMERIC_PICKER_STATES.has(state)) return true;

  // Recover desync: menu context persisted while session_state stayed cv_requested.
  if (state === "cv_requested") {
    return resolveRolePickPhase({ session_state: state, context: opts?.context ?? {} }) != null;
  }

  return false;
}

/** Session states where the user is in the candidate / job-seeker funnel. */
const CANDIDATE_MODE_STATES = new Set<WhatsAppSessionState>([
  "awaiting_consent",
  "consent_given",
  "cv_requested",
  "cv_received",
  "scored",
  "collecting_preferences",
  "role_family_selection",
  "role_job_selection",
  "preferences_complete",
  "active_alerts",
  "slot_selection",
  "vouch_q1",
  "vouch_q2",
  "vouch_q3",
  "vouch_q4",
  "vouch_q5",
]);

/** Registered user wants the job-seeker / CV path (not referral). */
export function looksLikeApplyIntent(text: string, opts?: ApplyIntentContext): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (isRoleNumericPickerReply(t, opts)) return false;
  if (EXPLICIT_APPLY_PATTERN.test(t) || EXPLICIT_APPLY_MENU_PATTERN.test(t)) return true;
  if (looksLikeSelfApply(t)) return true;
  return isCandidateIntentText(t);
}

export function isExplicitReferCommand(text: string): boolean {
  const t = (text ?? "").trim();
  return EXPLICIT_REFER_PATTERN.test(t) || EXPLICIT_REFER_MENU_PATTERN.test(t);
}

export function isCandidateModeSession(state: WhatsAppSessionState): boolean {
  return CANDIDATE_MODE_STATES.has(state);
}

export function isAmbiguousRegisteredGreeting(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (looksLikeApplyIntent(t) || looksLikeReferralAction({ type: "text", text: { body: t } }))
    return false;
  return /^(hi|hello|hey|hii+|good\s+(morning|afternoon|evening)|help|\?)$/i.test(t);
}

export function looksLikeReferralAction(message: ReferralInboundMessage): boolean {
  if (message.type === "document") return true;
  const text = message.type === "text" ? (message.text?.body ?? "").trim() : "";
  if (!text) return false;
  if (extractPhoneFromMessage(text)) return true;
  if (parseReferralFastPath(text)) return true;
  if (REFERRAL_KEYWORD_PATTERN.test(text)) return true;
  return false;
}

export function isSessionIdleForReferral(state: WhatsAppSessionState): boolean {
  return REFERRAL_IDLE_STATES.has(state);
}

export function isReferralFlowState(state: WhatsAppSessionState): boolean {
  return state === "referral_ready" || state === "referral_collecting";
}

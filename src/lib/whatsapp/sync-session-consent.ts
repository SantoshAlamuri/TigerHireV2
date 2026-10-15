import type { SupabaseClient } from "@supabase/supabase-js";
import { ConsentRepository } from "@/lib/repositories/ConsentRepository";
import {
  updateSession,
  withSessionCAS,
  type WhatsAppSession,
  type WhatsAppSessionState,
} from "./sessions";

const CONSENT_SYNC_STATES: WhatsAppSessionState[] = ["awaiting_consent", "new", "consent_given"];

export type SyncSessionWithConsentResult = { advanced: boolean };

/**
 * If the user already has required consent but the session is still on a pre-CV
 * state, advance to cv_requested so inbound messages route correctly.
 */
export async function syncSessionWithConsent(
  supabase: SupabaseClient,
  phone: string,
  session: WhatsAppSession,
): Promise<SyncSessionWithConsentResult> {
  const state = session.session_state;
  if (!CONSENT_SYNC_STATES.includes(state)) {
    return { advanced: false };
  }

  const hasConsent = await ConsentRepository.hasAllRequiredConsent(supabase, phone);
  if (!hasConsent) {
    return { advanced: false };
  }

  const context = { ...(session.context ?? {}) };
  await updateSession(phone, "cv_requested", context, session.version);
  return { advanced: true };
}

/**
 * After employee referral outreach, set session state based on whether consent
 * is already on file.
 */
export async function prepareSessionAfterEmployeeReferral(
  supabase: SupabaseClient,
  phone: string,
  context: Record<string, unknown>,
): Promise<WhatsAppSessionState> {
  const hasConsent = await ConsentRepository.hasAllRequiredConsent(supabase, phone);
  const nextState: WhatsAppSessionState = hasConsent ? "cv_requested" : "awaiting_consent";
  await withSessionCAS(phone, () => ({ state: nextState, context }));
  return nextState;
}

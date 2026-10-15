import { withSessionCAS, type WhatsAppSession } from "../sessions";
import { resolveRolePickPhase, sessionStateForRolePickPhase } from "../role-pick-routing";
import { handleRoleFamilySelectionReply } from "./family-selection";
import { handleRoleJobSelectionReply } from "./job-selection";

/**
 * Route a numeric reply when session state/context indicates an active role pick.
 * Repairs state desync (menu shown while still cv_requested).
 */
export async function routeRolePickReply(
  phone: string,
  text: string,
  session: WhatsAppSession,
): Promise<boolean> {
  const phase = resolveRolePickPhase(session);
  if (!phase) return false;

  if (session.session_state !== sessionStateForRolePickPhase(phase)) {
    await withSessionCAS(phone, () => ({
      state: sessionStateForRolePickPhase(phase),
      context: session.context ?? {},
    }));
  }

  if (phase === "category") {
    await handleRoleFamilySelectionReply(phone, text, session);
  } else {
    await handleRoleJobSelectionReply(phone, text, session);
  }
  return true;
}

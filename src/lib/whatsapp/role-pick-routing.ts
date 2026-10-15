import type { WhatsAppSession, WhatsAppSessionState } from "./sessions";

export type RolePickPhase = "category" | "job";

type RoleOptionShape = { label?: string; matchField?: string; matchValue?: string; count?: number };
type JobOptionShape = { id?: string; title?: string };

function hasRoleOptions(raw: unknown): boolean {
  return (
    Array.isArray(raw) && raw.length > 0 && typeof (raw[0] as RoleOptionShape)?.label === "string"
  );
}

function hasJobOptions(raw: unknown): boolean {
  return Array.isArray(raw) && raw.length > 0 && typeof (raw[0] as JobOptionShape)?.id === "string";
}

const PICK_STATES: Record<RolePickPhase, WhatsAppSessionState> = {
  category: "role_family_selection",
  job: "role_job_selection",
};

/**
 * Whether the session (state + context) is waiting for a numeric category or role pick.
 * Recovers desync when guided_role_options exist but session_state stayed cv_requested.
 */
export function resolveRolePickPhase(session: {
  session_state: WhatsAppSessionState;
  context?: Record<string, unknown>;
}): RolePickPhase | null {
  const state = session.session_state;
  const ctx = session.context ?? {};

  if (
    state === "role_job_selection" ||
    (state === "cv_requested" && hasJobOptions(ctx.guided_job_options))
  ) {
    return "job";
  }
  if (
    state === "role_family_selection" ||
    (state === "cv_requested" && hasRoleOptions(ctx.guided_role_options))
  ) {
    return "category";
  }
  return null;
}

export function sessionStateForRolePickPhase(phase: RolePickPhase): WhatsAppSessionState {
  return PICK_STATES[phase];
}

export function isNumericRolePickReply(text: string, session: WhatsAppSession): boolean {
  const trimmed = (text ?? "").trim();
  if (!/^\d+$/.test(trimmed)) return false;
  return resolveRolePickPhase(session) != null;
}

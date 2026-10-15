import type { UserRole } from "@/types/database";

/**
 * TECH-DEBT (PR2 transitional state model):
 * `approved` is intentionally retained as an intermediate state to avoid a risky
 * one-shot refactor of send/signing side-effects.
 *
 * Tracking ticket:
 * "Collapse offer `approved` state into `pending_admin → sent` transition."
 *
 * When that ticket is implemented:
 * - remove `approved` from the transition graph,
 * - route admin approval directly into send orchestration,
 * - update DB status constraints and related tests accordingly.
 */
export type OfferState =
  | "draft"
  | "pending_admin"
  | "pending_finance"
  | "approved"
  | "sent"
  | "accepted"
  | "declined"
  | "rejected"
  | "expired"
  | "negotiating";

type OfferActorRole = UserRole | "system";

type OfferTransitionRule = {
  from: OfferState;
  to: OfferState;
  actorRoles: OfferActorRole[];
  requiresReasonOnReject?: boolean;
};

const TERMINAL_OFFER_STATES: OfferState[] = ["accepted", "declined", "expired"];

const OFFER_TRANSITIONS: OfferTransitionRule[] = [
  {
    from: "draft",
    to: "pending_admin",
    actorRoles: ["hiring_manager", "recruiter", "leadership", "super_admin"],
  },
  {
    from: "pending_admin",
    to: "approved",
    actorRoles: ["leadership", "super_admin"],
  },
  {
    from: "pending_admin",
    to: "draft",
    actorRoles: ["leadership", "super_admin"],
    requiresReasonOnReject: true,
  },
  {
    from: "approved",
    to: "sent",
    actorRoles: ["leadership", "recruiter", "hiring_manager", "super_admin"],
  },
  {
    from: "sent",
    to: "accepted",
    actorRoles: ["candidate_pro", "candidate_free", "system"],
  },
  {
    from: "sent",
    to: "declined",
    actorRoles: ["candidate_pro", "candidate_free", "system"],
  },
  {
    from: "sent",
    to: "negotiating",
    actorRoles: ["candidate_pro", "candidate_free", "system"],
  },
  {
    from: "negotiating",
    to: "draft",
    actorRoles: ["leadership", "recruiter", "hiring_manager", "super_admin"],
  },
];

function normalizeOfferState(state: string): OfferState {
  if (state === "pending_finance") return "pending_admin";
  return state as OfferState;
}

export function validateOfferTransition(params: {
  from: string;
  to: string;
  actorRole: string;
  reason?: string | null;
}): { ok: true } | { ok: false; status: number; error: string } {
  const from = normalizeOfferState(params.from);
  const to = normalizeOfferState(params.to);
  if (from === to) return { ok: true };

  if (TERMINAL_OFFER_STATES.includes(from)) {
    return {
      ok: false,
      status: 409,
      error: `No transitions allowed from terminal offer state "${from}"`,
    };
  }

  const transition = OFFER_TRANSITIONS.find((rule) => rule.from === from && rule.to === to);
  if (!transition) {
    return {
      ok: false,
      status: 409,
      error: `Invalid offer transition from "${from}" to "${to}"`,
    };
  }

  if (!transition.actorRoles.includes(params.actorRole as OfferActorRole)) {
    return {
      ok: false,
      status: 403,
      error: `Role "${params.actorRole}" cannot transition offer from "${from}" to "${to}"`,
    };
  }

  if (transition.requiresReasonOnReject && !(params.reason ?? "").trim()) {
    return {
      ok: false,
      status: 422,
      error: "A reason is required for this rejection transition",
    };
  }

  return { ok: true };
}

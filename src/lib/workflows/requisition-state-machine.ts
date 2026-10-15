import type { UserRole } from "@/types/database";

export type RequisitionState =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "on_hold"
  | "converted"
  | "cancelled";

export type RequisitionTransitionRule = {
  from: RequisitionState;
  to: RequisitionState;
  actorRoles: Array<UserRole | "system">;
  requiresReasonOnReject?: boolean;
};

export const TERMINAL_REQUISITION_STATES: RequisitionState[] = ["converted", "cancelled"];

export const REQUISITION_TRANSITIONS: RequisitionTransitionRule[] = [
  { from: "draft", to: "under_review", actorRoles: ["hiring_manager", "recruiter", "leadership"] },
  { from: "submitted", to: "under_review", actorRoles: ["hiring_manager"] },
  {
    from: "under_review",
    to: "under_review",
    actorRoles: ["recruiter", "finance", "leadership", "super_admin"],
  },
  {
    from: "under_review",
    to: "rejected",
    actorRoles: ["recruiter", "finance", "leadership", "super_admin"],
    requiresReasonOnReject: true,
  },
  {
    from: "under_review",
    to: "approved",
    actorRoles: ["recruiter", "leadership", "super_admin"],
  },
  {
    from: "under_review",
    to: "converted",
    actorRoles: ["recruiter", "leadership", "super_admin", "system"],
  },
  {
    from: "approved",
    to: "converted",
    actorRoles: ["recruiter", "leadership", "super_admin", "system"],
  },
  {
    from: "under_review",
    to: "on_hold",
    actorRoles: ["recruiter", "finance", "leadership", "super_admin"],
  },
  {
    from: "on_hold",
    to: "under_review",
    actorRoles: ["recruiter", "finance", "leadership", "super_admin"],
  },
  {
    from: "draft",
    to: "cancelled",
    actorRoles: ["hiring_manager", "leadership", "super_admin"],
  },
  {
    from: "submitted",
    to: "cancelled",
    actorRoles: ["hiring_manager", "leadership", "super_admin"],
  },
  {
    from: "under_review",
    to: "cancelled",
    actorRoles: ["hiring_manager", "leadership", "super_admin"],
  },
  {
    from: "on_hold",
    to: "cancelled",
    actorRoles: ["hiring_manager", "leadership", "super_admin"],
  },
  {
    from: "approved",
    to: "cancelled",
    actorRoles: ["hiring_manager", "leadership", "super_admin"],
  },
];

export function validateRequisitionTransition(params: {
  from: string;
  to: string;
  actorRole: string;
  reason?: string | null;
}): { ok: true } | { ok: false; status: number; error: string } {
  const from = params.from as RequisitionState;
  const to = params.to as RequisitionState;
  if (from === to) return { ok: true };

  if (TERMINAL_REQUISITION_STATES.includes(from)) {
    return {
      ok: false,
      status: 409,
      error: `No transitions allowed from terminal requisition state "${from}"`,
    };
  }

  const transition = REQUISITION_TRANSITIONS.find((t) => t.from === from && t.to === to);
  if (!transition) {
    return {
      ok: false,
      status: 409,
      error: `Invalid requisition transition from "${from}" to "${to}"`,
    };
  }

  if (!transition.actorRoles.includes(params.actorRole as UserRole | "system")) {
    return {
      ok: false,
      status: 403,
      error: `Role "${params.actorRole}" cannot transition requisition from "${from}" to "${to}"`,
    };
  }

  if (transition.requiresReasonOnReject) {
    const reason = params.reason?.trim() ?? "";
    if (!reason) {
      return {
        ok: false,
        status: 422,
        error: "A reason is required when rejecting this requisition stage",
      };
    }
  }

  return { ok: true };
}

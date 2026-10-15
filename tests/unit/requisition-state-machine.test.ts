import { describe, expect, it } from "vitest";
import {
  REQUISITION_TRANSITIONS,
  validateRequisitionTransition,
} from "@/lib/workflows/requisition-state-machine";

describe("requisition-state-machine", () => {
  it("allows every configured transition happy path", () => {
    for (const transition of REQUISITION_TRANSITIONS) {
      const result = validateRequisitionTransition({
        from: transition.from,
        to: transition.to,
        actorRole: transition.actorRoles[0]!,
        reason: transition.requiresReasonOnReject ? "Required rejection reason" : null,
      });
      expect(result).toEqual({ ok: true });
    }
  });

  it("requires reason on reject transitions", () => {
    const rejectTransitions = REQUISITION_TRANSITIONS.filter((t) => t.requiresReasonOnReject);
    expect(rejectTransitions.length).toBeGreaterThan(0);
    for (const transition of rejectTransitions) {
      const result = validateRequisitionTransition({
        from: transition.from,
        to: transition.to,
        actorRole: transition.actorRoles[0]!,
        reason: "",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(422);
      }
    }
  });

  it("blocks transitions from terminal states", () => {
    const result = validateRequisitionTransition({
      from: "converted",
      to: "under_review",
      actorRole: "leadership",
      reason: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
    }
  });

  it("rejects transition when actor role does not match", () => {
    const result = validateRequisitionTransition({
      from: "under_review",
      to: "approved",
      actorRole: "hiring_manager",
      reason: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
  });

  it("allows workflow completion from under_review to converted with JD generation", () => {
    for (const role of ["recruiter", "leadership", "super_admin"] as const) {
      const result = validateRequisitionTransition({
        from: "under_review",
        to: "converted",
        actorRole: role,
        reason: null,
      });
      expect(result).toEqual({ ok: true });
    }
  });

  it("allows cancel path from each cancellable state", () => {
    const cancellableStates = [
      "draft",
      "submitted",
      "under_review",
      "on_hold",
      "approved",
    ] as const;
    for (const from of cancellableStates) {
      const result = validateRequisitionTransition({
        from,
        to: "cancelled",
        actorRole: "leadership",
        reason: "Role no longer needed",
      });
      expect(result).toEqual({ ok: true });
    }
  });
});

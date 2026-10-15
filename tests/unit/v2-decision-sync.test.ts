import { describe, it, expect } from "vitest";
import {
  statusForDecision,
  buildDecisionPayload,
  summariseDecisions,
} from "@/lib/v2/decision-sync";

/**
 * A decision in the queue has to become a real application status, and the
 * reject reason has to survive the trip — it is what the fairness report groups
 * by and what makes a candidate reusable in the talent pool.
 */
describe("statusForDecision", () => {
  it("advances to shortlisted", () => {
    expect(statusForDecision("advance")).toBe("shortlisted");
  });

  it("marks a hold as viewed, not shortlisted — holding is not endorsing", () => {
    expect(statusForDecision("hold")).toBe("viewed");
  });

  it("rejects to rejected", () => {
    expect(statusForDecision("reject")).toBe("rejected");
  });
});

describe("buildDecisionPayload", () => {
  it("sends only the status for an advance", () => {
    expect(buildDecisionPayload({ id: "a1", decision: "advance", reason: null })).toEqual({
      status: "shortlisted",
    });
  });

  it("carries the reject reason through so reporting can group it", () => {
    expect(buildDecisionPayload({ id: "a1", decision: "reject", reason: "compensation" })).toEqual({
      status: "rejected",
      rejection_reason: "compensation",
    });
  });

  it("never sends a rejection_reason key when there is no reason", () => {
    const payload = buildDecisionPayload({ id: "a1", decision: "hold", reason: null });
    expect(payload).toEqual({ status: "viewed" });
    expect("rejection_reason" in payload).toBe(false);
  });
});

describe("hold restore", () => {
  it("restores a hold to applied", async () => {
    const { holdRestorePayload, isHoldRestoreAllowed } = await import("@/lib/v2/decision-sync");
    expect(holdRestorePayload()).toEqual({ status: "applied" });
    expect(isHoldRestoreAllowed("viewed", "applied")).toBe(true);
  });

  it("refuses to restore shortlist or reject to applied", async () => {
    const { isHoldRestoreAllowed } = await import("@/lib/v2/decision-sync");
    expect(isHoldRestoreAllowed("shortlisted", "applied")).toBe(false);
    expect(isHoldRestoreAllowed("rejected", "applied")).toBe(false);
    expect(isHoldRestoreAllowed("applied", "applied")).toBe(false);
  });
});

describe("summariseDecisions", () => {
  it("counts nothing for an empty session", () => {
    expect(summariseDecisions([])).toEqual({ advanced: 0, held: 0, rejected: 0, total: 0 });
  });

  it("counts each kind so the cleared screen can report the session honestly", () => {
    const s = summariseDecisions([
      { id: "1", decision: "advance", reason: null },
      { id: "2", decision: "advance", reason: null },
      { id: "3", decision: "hold", reason: null },
      { id: "4", decision: "reject", reason: "location" },
    ]);
    expect(s).toEqual({ advanced: 2, held: 1, rejected: 1, total: 4 });
  });
});

import { describe, expect, it } from "vitest";
import { validateOfferTransition } from "@/lib/workflows/offer-state-machine";

describe("offer-state-machine", () => {
  it("allows draft to pending_admin for recruiter", () => {
    const result = validateOfferTransition({
      from: "draft",
      to: "pending_admin",
      actorRole: "recruiter",
    });
    expect(result).toEqual({ ok: true });
  });

  it("requires reason for pending_admin to draft rejection", () => {
    const result = validateOfferTransition({
      from: "pending_admin",
      to: "draft",
      actorRole: "leadership",
      reason: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(422);
  });

  it("blocks invalid actor role", () => {
    const result = validateOfferTransition({
      from: "pending_admin",
      to: "approved",
      actorRole: "recruiter",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("normalizes legacy pending_finance to pending_admin", () => {
    const result = validateOfferTransition({
      from: "pending_finance",
      to: "approved",
      actorRole: "leadership",
    });
    expect(result).toEqual({ ok: true });
  });

  it("allows sent to negotiating for candidate (counter-offer path)", () => {
    const result = validateOfferTransition({
      from: "sent",
      to: "negotiating",
      actorRole: "candidate_pro",
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects sent to pending_admin (use negotiating for counters)", () => {
    const result = validateOfferTransition({
      from: "sent",
      to: "pending_admin",
      actorRole: "candidate_pro",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });

  it("allows negotiating back to draft for recruiting roles", () => {
    const result = validateOfferTransition({
      from: "negotiating",
      to: "draft",
      actorRole: "recruiter",
    });
    expect(result).toEqual({ ok: true });
  });

  it("blocks transitions from terminal states", () => {
    const result = validateOfferTransition({
      from: "accepted",
      to: "pending_admin",
      actorRole: "leadership",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });
});

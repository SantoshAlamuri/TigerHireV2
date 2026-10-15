import { describe, it, expect } from "vitest";
import { offerState, type OfferRow } from "@/lib/v2/offer-state";

/**
 * The offer stage is where India loses roughly a third of accepted-in-principle
 * hires, and where a candidate holding a competing offer decides. So an offer
 * needs a state a recruiter can act on, not a status chip.
 *
 * The distinction that matters most: sent-and-never-opened is a delivery
 * problem, while opened-repeatedly-and-unsigned is a negotiation problem. They
 * need opposite responses, so they must never render the same.
 */
function offer(over: Partial<OfferRow> = {}): OfferRow {
  return {
    id: "o1",
    candidateName: "Priyanka D.",
    status: "sent",
    signingStatus: null,
    sentAt: "2026-07-20T00:00:00Z",
    firstViewedAt: null,
    viewCount: 0,
    signedAt: null,
    declinedAt: null,
    expiresAt: null,
    ...over,
  };
}

const NOW = Date.parse("2026-07-24T00:00:00Z");

describe("offerState", () => {
  it("reports a signed offer as done, with no urgency", () => {
    const s = offerState(offer({ signedAt: "2026-07-22T00:00:00Z", status: "accepted" }), NOW);
    expect(s.stage).toBe("Signed");
    expect(s.needsAction).toBe(false);
  });

  it("reports a declined offer plainly", () => {
    const s = offerState(offer({ declinedAt: "2026-07-22T00:00:00Z", status: "declined" }), NOW);
    expect(s.stage).toBe("Declined");
    expect(s.needsAction).toBe(false);
  });

  it("separates never-opened from opened — they need opposite responses", () => {
    const unopened = offerState(offer({ firstViewedAt: null, viewCount: 0 }), NOW);
    const opened = offerState(offer({ firstViewedAt: "2026-07-21T00:00:00Z", viewCount: 3 }), NOW);
    expect(unopened.stage).toBe("Sent, not opened");
    expect(opened.stage).toBe("Opened, not signed");
    expect(unopened.stage).not.toBe(opened.stage);
  });

  it("calls an unopened offer a delivery problem, because that is what it is", () => {
    const s = offerState(offer({ firstViewedAt: null }), NOW);
    expect(s.hint).toMatch(/reach|deliver|receive/i);
  });

  it("calls a repeatedly-opened unsigned offer a decision problem", () => {
    const s = offerState(offer({ firstViewedAt: "2026-07-21T00:00:00Z", viewCount: 4 }), NOW);
    expect(s.hint).toMatch(/considering|deciding|competing|call/i);
  });

  it("counts days since sending, which is the pressure", () => {
    const s = offerState(offer({ sentAt: "2026-07-20T00:00:00Z" }), NOW);
    expect(s.daysOut).toBe(4);
  });

  it("escalates once an offer has been out several days", () => {
    expect(offerState(offer({ sentAt: "2026-07-23T00:00:00Z" }), NOW).needsAction).toBe(false);
    expect(offerState(offer({ sentAt: "2026-07-18T00:00:00Z" }), NOW).needsAction).toBe(true);
  });

  it("treats an expired offer as needing action, not as quietly closed", () => {
    const s = offerState(offer({ expiresAt: "2026-07-22T00:00:00Z" }), NOW);
    expect(s.stage).toBe("Expired");
    expect(s.needsAction).toBe(true);
  });

  it("does not call an offer expired when it is signed", () => {
    const s = offerState(
      offer({ expiresAt: "2026-07-22T00:00:00Z", signedAt: "2026-07-21T00:00:00Z" }),
      NOW,
    );
    expect(s.stage).toBe("Signed");
  });

  it("handles an offer that was never sent", () => {
    const s = offerState(offer({ status: "draft", sentAt: null }), NOW);
    expect(s.stage).toBe("Draft");
    expect(s.daysOut).toBe(0);
    expect(s.needsAction).toBe(false);
  });

  it("survives unparseable dates rather than showing NaN days", () => {
    const s = offerState(offer({ sentAt: "nonsense" }), NOW);
    expect(Number.isNaN(s.daysOut)).toBe(false);
  });
});

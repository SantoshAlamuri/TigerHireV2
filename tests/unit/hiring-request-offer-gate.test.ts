import { describe, it, expect } from "vitest";
import { hiringRequestGateErrorForOffer } from "@/lib/offers/hiring-request-offer-gate";

describe("hiringRequestGateErrorForOffer", () => {
  it("rejects when job has no hiring_request_id", () => {
    const r = hiringRequestGateErrorForOffer({
      hiringRequestId: null,
      hiringRequest: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.error).toContain("not linked");
    }
  });

  it("rejects when hiring request row missing", () => {
    const r = hiringRequestGateErrorForOffer({
      hiringRequestId: "33333333-3333-4333-8333-333333333333",
      hiringRequest: null,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects under_review", () => {
    const r = hiringRequestGateErrorForOffer({
      hiringRequestId: "33333333-3333-4333-8333-333333333333",
      hiringRequest: {
        id: "33333333-3333-4333-8333-333333333333",
        status: "under_review",
        req_code: "REQ-1",
      },
    });
    expect(r.ok).toBe(false);
  });

  it("allows approved", () => {
    const r = hiringRequestGateErrorForOffer({
      hiringRequestId: "33333333-3333-4333-8333-333333333333",
      hiringRequest: {
        id: "33333333-3333-4333-8333-333333333333",
        status: "approved",
        req_code: "REQ-1",
      },
    });
    expect(r.ok).toBe(true);
  });

  it("allows converted", () => {
    const r = hiringRequestGateErrorForOffer({
      hiringRequestId: "33333333-3333-4333-8333-333333333333",
      hiringRequest: {
        id: "33333333-3333-4333-8333-333333333333",
        status: "converted",
        req_code: "REQ-1",
      },
    });
    expect(r.ok).toBe(true);
  });
});

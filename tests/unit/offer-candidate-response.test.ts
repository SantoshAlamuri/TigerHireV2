import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockQueryBuilder } from "../helpers";

const mockEnqueue = vi.fn();

vi.mock("@/lib/jobs/queue", () => ({
  enqueue: (...args: unknown[]) => mockEnqueue(...args),
}));

vi.mock("@/lib/services/notifications", () => ({
  createNotification: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/audit/hiring-offer-audit", () => ({
  recordHiringOfferAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/offers/void-offer-envelope", () => ({
  fireAndForgetVoidOfferEnvelope: vi.fn(),
}));

describe("executeOfferCandidateResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnqueue.mockResolvedValue({});
  });

  it("enqueues offer-bgv-trigger after accept", async () => {
    const sentOffer = {
      id: "offer-1",
      status: "sent",
      expires_at: null,
      created_by: "rec-1",
      organisation_id: "org-1",
      document_content: null,
      applications: { candidate_id: "cand-1" },
    };
    const acceptedRow = {
      ...sentOffer,
      status: "accepted",
      application_id: "app-1",
      role_title: "Engineer",
    };
    const offersBuilder = createMockQueryBuilder({});
    offersBuilder.single = vi.fn().mockResolvedValue({ data: sentOffer, error: null });
    offersBuilder.maybeSingle = vi.fn().mockResolvedValue({ data: acceptedRow, error: null });

    const admin = {
      from: vi.fn((table: string) => {
        if (table === "offers") return offersBuilder;
        if (table === "candidates") {
          return createMockQueryBuilder({ data: { id: "cand-1", user_id: "user-cand" } });
        }
        if (table === "offer_candidate_responses") return createMockQueryBuilder({ data: null });
        return createMockQueryBuilder();
      }),
    };

    const { executeOfferCandidateResponse } = await import("@/lib/offers/offer-candidate-response");
    const result = await executeOfferCandidateResponse(admin as never, {
      offerId: "offer-1",
      body: { response: "accept" },
      candidateUserId: "user-cand",
      actorProfileId: "user-cand",
      actorRole: "candidate_pro",
      requestIp: "127.0.0.1",
      logRoute: "test",
    });

    expect(result.ok).toBe(true);
    expect(mockEnqueue).toHaveBeenCalledWith(
      "offer-bgv-trigger",
      {
        offerId: "offer-1",
        organisationId: "org-1",
        candidateId: "cand-1",
        applicationId: "app-1",
      },
      { id: "offer-bgv-trigger:offer-1" },
    );
  });

  it("sets negotiating status on counter and skips BGV trigger", async () => {
    const sentOffer = {
      id: "offer-2",
      status: "sent",
      expires_at: null,
      created_by: "rec-1",
      organisation_id: "org-1",
      document_content: null,
      applications: { candidate_id: "cand-1" },
    };
    const negotiatingRow = {
      ...sentOffer,
      status: "negotiating",
      application_id: "app-1",
      role_title: "Engineer",
    };
    const offersBuilder = createMockQueryBuilder({});
    offersBuilder.single = vi.fn().mockResolvedValue({ data: sentOffer, error: null });
    offersBuilder.maybeSingle = vi.fn().mockResolvedValue({ data: negotiatingRow, error: null });

    const admin = {
      from: vi.fn((table: string) => {
        if (table === "offers") return offersBuilder;
        if (table === "candidates") {
          return createMockQueryBuilder({ data: { id: "cand-1", user_id: "user-cand" } });
        }
        if (table === "offer_candidate_responses") return createMockQueryBuilder({ data: null });
        return createMockQueryBuilder();
      }),
    };

    const { executeOfferCandidateResponse } = await import("@/lib/offers/offer-candidate-response");
    const result = await executeOfferCandidateResponse(admin as never, {
      offerId: "offer-2",
      body: { response: "counter", comment: "Need higher CTC" },
      candidateUserId: "user-cand",
      actorProfileId: "user-cand",
      actorRole: "candidate_pro",
      requestIp: "127.0.0.1",
      logRoute: "test",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.offer.status).toBe("negotiating");
    }
    expect(mockEnqueue).not.toHaveBeenCalledWith(
      "offer-bgv-trigger",
      expect.anything(),
      expect.anything(),
    );
  });
});

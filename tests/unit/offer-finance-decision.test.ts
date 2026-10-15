import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockQueryBuilder } from "../helpers";

const mockExecuteOfferSend = vi.fn();

vi.mock("@/lib/offers/offer-send", () => ({
  executeOfferSend: (...args: unknown[]) => mockExecuteOfferSend(...args),
}));

vi.mock("@/lib/services/notifications", () => ({
  createNotification: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/audit/hiring-offer-audit", () => ({
  recordHiringOfferAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/workflows/offer-finance-workflow", () => ({
  completeActiveOfferFinanceStage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/approvals/actor-resolution", () => ({
  canActorApproveRequiredRole: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/security/enterprise-roles", () => ({
  hasAnyEnterpriseRole: vi.fn().mockResolvedValue(false),
}));

describe("executeOfferFinanceDecision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteOfferSend.mockResolvedValue({
      ok: true,
      offer: { id: "offer-1", status: "sent" },
    });
  });

  it("skips auto-send when offer has a candidate counter response", async () => {
    const pendingOffer = {
      id: "offer-1",
      created_by: "rec-1",
      organisation_id: "org-1",
      status: "pending_admin",
    };
    const approvedOffer = { ...pendingOffer, status: "approved" };

    const offersBuilder = createMockQueryBuilder({});
    offersBuilder.single = vi.fn().mockResolvedValue({ data: pendingOffer, error: null });
    offersBuilder.maybeSingle = vi.fn().mockResolvedValue({ data: approvedOffer, error: null });

    const admin = {
      from: vi.fn((table: string) => {
        if (table === "offers") return offersBuilder;
        if (table === "offer_approvals") return createMockQueryBuilder({ data: null });
        if (table === "offer_candidate_responses") {
          return createMockQueryBuilder({ data: { id: "counter-1" } });
        }
        return createMockQueryBuilder();
      }),
    };

    const { executeOfferFinanceDecision } = await import("@/lib/offers/offer-finance-decision");
    const result = await executeOfferFinanceDecision(admin as never, {
      offerId: "offer-1",
      decision: "approved",
      comment: null,
      actorProfileId: "admin-1",
      actorRole: "leadership",
      requestIp: "127.0.0.1",
      logRoute: "test",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.autoSend).toEqual({
        sent: false,
        reason:
          "Offer was revised after a candidate counter-offer. Send manually after re-approval.",
      });
    }
    expect(mockExecuteOfferSend).not.toHaveBeenCalled();
  });

  it("auto-sends after approval when no candidate counter exists", async () => {
    const pendingOffer = {
      id: "offer-2",
      created_by: "rec-1",
      organisation_id: "org-1",
      status: "pending_admin",
    };
    const approvedOffer = { ...pendingOffer, status: "approved" };

    const offersBuilder = createMockQueryBuilder({});
    offersBuilder.single = vi.fn().mockResolvedValue({ data: pendingOffer, error: null });
    offersBuilder.maybeSingle = vi.fn().mockResolvedValue({ data: approvedOffer, error: null });

    const counterResponsesBuilder = createMockQueryBuilder({});
    counterResponsesBuilder.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

    const admin = {
      from: vi.fn((table: string) => {
        if (table === "offers") return offersBuilder;
        if (table === "offer_approvals") return createMockQueryBuilder({ data: null });
        if (table === "offer_candidate_responses") return counterResponsesBuilder;
        return createMockQueryBuilder();
      }),
    };

    const { executeOfferFinanceDecision } = await import("@/lib/offers/offer-finance-decision");
    const result = await executeOfferFinanceDecision(admin as never, {
      offerId: "offer-2",
      decision: "approved",
      comment: null,
      actorProfileId: "admin-1",
      actorRole: "leadership",
      requestIp: "127.0.0.1",
      logRoute: "test",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.autoSend).toEqual({ sent: true });
    }
    expect(mockExecuteOfferSend).toHaveBeenCalledOnce();
  });
});

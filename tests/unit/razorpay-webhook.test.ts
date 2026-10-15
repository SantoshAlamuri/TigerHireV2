import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockQueryBuilder } from "../helpers";

const mockVerifySignature = vi.fn();
const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockInvalidateEntitlement = vi.fn();

vi.mock("@/lib/services/razorpay", () => ({
  verifyRazorpayWebhookSignature: (...args: unknown[]) => mockVerifySignature(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

vi.mock("@/lib/entitlements", () => ({
  invalidateOrganisationEntitlement: (...args: unknown[]) => mockInvalidateEntitlement(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/observability/report-error", () => ({
  reportError: vi.fn(),
}));

describe("POST /api/webhooks/razorpay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifySignature.mockReturnValue(true);
    mockRpc.mockResolvedValue({ data: true });
    mockFrom.mockReturnValue(createMockQueryBuilder({ data: null }));
  });

  it("returns 401 when signature is invalid", async () => {
    mockVerifySignature.mockReturnValue(false);
    const { POST } = await import("@/app/api/webhooks/razorpay/route");
    const req = new Request("http://localhost/api/webhooks/razorpay", {
      method: "POST",
      headers: { "x-razorpay-signature": "invalid" },
      body: "{}",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it("returns 200 for duplicate event id", async () => {
    mockRpc.mockResolvedValue({ data: false });
    const { POST } = await import("@/app/api/webhooks/razorpay/route");
    const req = new Request("http://localhost/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "x-razorpay-signature": "sig",
        "x-razorpay-event-id": "event_123",
      },
      body: JSON.stringify({ event: "subscription.activated", payload: {} }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("webhook_event_try_acquire", {
      p_provider: "razorpay",
      p_event_id: "event_123",
    });
  });

  it("upserts company subscription and invalidates entitlement cache", async () => {
    const upsertBuilder = createMockQueryBuilder({ data: null });
    const orgUpdateBuilder = createMockQueryBuilder({ data: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === "subscriptions") return upsertBuilder;
      if (table === "organisations") return orgUpdateBuilder;
      return createMockQueryBuilder({ data: null });
    });

    const { POST } = await import("@/app/api/webhooks/razorpay/route");
    const req = new Request("http://localhost/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "x-razorpay-signature": "sig",
        "x-razorpay-event-id": "event_company_1",
      },
      body: JSON.stringify({
        event: "subscription.activated",
        payload: {
          subscription: {
            entity: {
              id: "sub_rzp_1",
              customer_id: "cust_rzp_1",
              status: "active",
              notes: {
                type: "company",
                organisation_id: "org-1",
                plan: "growth",
              },
            },
          },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(mockInvalidateEntitlement).toHaveBeenCalledWith("org-1");
    expect(upsertBuilder.upsert).toHaveBeenCalled();
    expect(orgUpdateBuilder.update).toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON payload", async () => {
    const { POST } = await import("@/app/api/webhooks/razorpay/route");
    const req = new Request("http://localhost/api/webhooks/razorpay", {
      method: "POST",
      headers: { "x-razorpay-signature": "sig" },
      body: "{",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("handles candidate subscription updates", async () => {
    const subBuilder = createMockQueryBuilder({ data: null });
    const profileBuilder = createMockQueryBuilder({ data: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === "subscriptions") return subBuilder;
      if (table === "profiles") return profileBuilder;
      return createMockQueryBuilder({ data: null });
    });

    const { POST } = await import("@/app/api/webhooks/razorpay/route");
    const req = new Request("http://localhost/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "x-razorpay-signature": "sig",
        "x-razorpay-event-id": "event_candidate_1",
      },
      body: JSON.stringify({
        event: "subscription.activated",
        payload: {
          subscription: {
            entity: {
              id: "sub_rzp_candidate_1",
              customer_id: "cust_rzp_candidate_1",
              status: "active",
              notes: {
                type: "candidate",
                user_id: "user-1",
              },
            },
          },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(subBuilder.upsert).toHaveBeenCalled();
    expect(profileBuilder.update).toHaveBeenCalled();
    expect(mockInvalidateEntitlement).not.toHaveBeenCalled();
  });

  it("maps payment.failed event to past_due status", async () => {
    const upsertBuilder = createMockQueryBuilder({ data: null });
    mockFrom.mockImplementation((table: string) =>
      table === "subscriptions" ? upsertBuilder : createMockQueryBuilder({ data: null }),
    );
    const { POST } = await import("@/app/api/webhooks/razorpay/route");
    const req = new Request("http://localhost/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "x-razorpay-signature": "sig",
        "x-razorpay-event-id": "event_company_failed",
      },
      body: JSON.stringify({
        event: "payment.failed",
        payload: {
          subscription: {
            entity: {
              id: "sub_rzp_failed",
              status: "active",
              notes: { type: "company", organisation_id: "org-1", plan: "growth" },
            },
          },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(upsertBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "past_due" }),
      expect.any(Object),
    );
  });

  it("ignores webhook without routing notes", async () => {
    const { POST } = await import("@/app/api/webhooks/razorpay/route");
    const req = new Request("http://localhost/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "x-razorpay-signature": "sig",
        "x-razorpay-event-id": "event_unknown",
      },
      body: JSON.stringify({
        event: "subscription.activated",
        payload: {
          subscription: {
            entity: {
              id: "sub_rzp_unknown",
              status: "active",
              notes: {},
            },
          },
        },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });
});

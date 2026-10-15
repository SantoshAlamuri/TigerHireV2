import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockQueryBuilder } from "../helpers";

const mockConstructEvent = vi.fn();
const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/services/stripe", () => ({
  getStripe: () => ({
    webhooks: { constructEvent: mockConstructEvent },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    rpc: mockRpc,
    from: mockFrom,
  }),
}));

vi.mock("@/lib/config/env", () => ({
  env: { stripeWebhookSecret: "whsec_test123" },
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/observability/report-error", () => ({
  reportError: vi.fn(),
}));

vi.mock("@/lib/entitlements", () => ({
  invalidateOrganisationEntitlement: vi.fn(),
}));

describe("POST /api/webhooks/stripe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue(createMockQueryBuilder({ data: null }));
  });

  function buildWebhookRequest(body: string, sig = "test-sig") {
    return new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": sig,
      },
      body,
    });
  }

  it("returns 400 when signature is missing", async () => {
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const req = new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Missing signature");
  });

  it("returns 400 when signature verification fails", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("Signature verification failed");
    });

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const req = buildWebhookRequest("{}");
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("returns 200 for duplicate event (idempotency)", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_duplicate_123",
      type: "checkout.session.completed",
      data: { object: { metadata: {} } },
    });
    mockRpc.mockResolvedValue({ data: false });

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const req = buildWebhookRequest('{"id":"evt_duplicate_123"}');
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("webhook_event_try_acquire", {
      p_provider: "stripe",
      p_event_id: "evt_duplicate_123",
    });
  });

  it("processes checkout.session.completed for company", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_company_checkout",
      type: "checkout.session.completed",
      data: {
        object: {
          subscription: "sub_123",
          customer: "cus_123",
          metadata: {
            type: "company",
            organisation_id: "org-1",
            plan: "growth",
          },
        },
      },
    });
    mockRpc.mockResolvedValueOnce({ data: true }).mockResolvedValueOnce({ data: null });

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const req = buildWebhookRequest("{}");
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("stripe_checkout_company", {
      p_organisation_id: "org-1",
      p_stripe_subscription_id: "sub_123",
      p_stripe_customer_id: "cus_123",
      p_plan: "growth",
    });
  });

  it("processes checkout.session.completed for candidate", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_candidate_checkout",
      type: "checkout.session.completed",
      data: {
        object: {
          subscription: "sub_456",
          customer: "cus_456",
          metadata: { type: "candidate", user_id: "user-1" },
        },
      },
    });
    mockRpc.mockResolvedValueOnce({ data: true }).mockResolvedValueOnce({ data: null });

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const req = buildWebhookRequest("{}");
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("stripe_checkout_candidate", {
      p_user_id: "user-1",
      p_stripe_subscription_id: "sub_456",
      p_stripe_customer_id: "cus_456",
    });
  });

  it("processes subscription.updated", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_sub_updated",
      type: "customer.subscription.updated",
      data: {
        object: { id: "sub_789", status: "active" },
      },
    });
    mockRpc.mockResolvedValueOnce({ data: true });

    const updateBuilder = createMockQueryBuilder({ data: null });
    mockFrom.mockReturnValue(updateBuilder);

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const req = buildWebhookRequest("{}");
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(mockFrom).toHaveBeenCalledWith("subscriptions");
  });

  it("processes subscription.deleted with candidate downgrade", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_sub_deleted",
      type: "customer.subscription.deleted",
      data: {
        object: { id: "sub_999" },
      },
    });
    mockRpc.mockResolvedValueOnce({ data: true });

    const subData = {
      organisation_id: null,
      user_id: "user-candidate-1",
      candidate_plan: "pro",
    };
    const subBuilder = createMockQueryBuilder({ data: subData });
    const updateBuilder = createMockQueryBuilder({ data: null });

    let callIdx = 0;
    mockFrom.mockImplementation(() => {
      callIdx++;
      if (callIdx === 1) return subBuilder;
      return updateBuilder;
    });

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const req = buildWebhookRequest("{}");
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it("processes subscription.deleted with org downgrade", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_sub_deleted_org",
      type: "customer.subscription.deleted",
      data: {
        object: { id: "sub_org_1" },
      },
    });
    mockRpc.mockResolvedValueOnce({ data: true });

    const subData = {
      organisation_id: "org-1",
      user_id: null,
      candidate_plan: null,
    };
    const subBuilder = createMockQueryBuilder({ data: subData });
    const updateBuilder = createMockQueryBuilder({ data: null });

    let callIdx = 0;
    mockFrom.mockImplementation(() => {
      callIdx++;
      if (callIdx === 1) return subBuilder;
      return updateBuilder;
    });

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const req = buildWebhookRequest("{}");
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it("processes invoice.payment_failed", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_payment_failed",
      type: "invoice.payment_failed",
      data: {
        object: { subscription: "sub_fail_1" },
      },
    });
    mockRpc.mockResolvedValueOnce({ data: true });

    const updateBuilder = createMockQueryBuilder({ data: null });
    mockFrom.mockReturnValue(updateBuilder);

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const req = buildWebhookRequest("{}");
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(mockFrom).toHaveBeenCalledWith("subscriptions");
  });

  it("returns 500 when handler throws", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_error",
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: {
            type: "company",
            organisation_id: "org-1",
            plan: "growth",
          },
          subscription: "sub_err",
          customer: "cus_err",
        },
      },
    });
    mockRpc.mockResolvedValueOnce({ data: true }).mockRejectedValueOnce(new Error("DB down"));

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const req = buildWebhookRequest("{}");
    const res = await POST(req as never);
    expect(res.status).toBe(500);
  });

  it("handles unknown event types gracefully", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_unknown",
      type: "some.unknown.event",
      data: { object: {} },
    });
    mockRpc.mockResolvedValueOnce({ data: true });

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const req = buildWebhookRequest("{}");
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);
  });
});

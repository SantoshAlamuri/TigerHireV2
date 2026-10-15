/**
 * Integration tests for Stripe webhook event processing flows.
 *
 * These tests verify that:
 * 1. checkout.session.completed activates subscriptions and upgrades roles
 * 2. customer.subscription.deleted downgrades users/orgs appropriately
 * 3. invoice.payment_failed marks subscriptions past_due without immediate downgrade
 * 4. Duplicate events are handled idempotently via webhook_event_try_acquire
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Shared mock state ---
const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/config/env", () => ({
  env: { stripeWebhookSecret: "whsec_test_secret" },
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/observability/report-error", () => ({
  reportError: vi.fn(),
}));

vi.mock("@/lib/entitlements", () => ({
  invalidateOrganisationEntitlement: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

const mockConstructEvent = vi.fn();
vi.mock("@/lib/services/stripe", () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: (...args: unknown[]) => mockConstructEvent(...args),
    },
  }),
}));

function makeRequest(body: string, sig = "valid-sig"): Request {
  return new Request("http://localhost:3000/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": sig },
    body,
  });
}

function chainableBuilder() {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.update = vi.fn().mockReturnValue(builder);
  builder.select = vi.fn().mockReturnValue(builder);
  builder.eq = vi.fn().mockReturnValue(builder);
  builder.single = vi.fn().mockResolvedValue({ data: null, error: null });
  return builder;
}

describe("Stripe Webhook Flows", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRpc.mockReset();
    mockFrom.mockReset();
    mockConstructEvent.mockReset();
  });

  describe("checkout.session.completed", () => {
    it("activates subscription on successful company payment", async () => {
      const event = {
        id: "evt_checkout_company_1",
        type: "checkout.session.completed",
        data: {
          object: {
            subscription: "sub_123",
            customer: "cus_123",
            metadata: {
              type: "company",
              organisation_id: "org-1",
              plan: "pro",
            },
          },
        },
      };

      mockConstructEvent.mockReturnValue(event);
      mockRpc.mockImplementation((name: string) => {
        if (name === "webhook_event_try_acquire") {
          return { data: true, error: null };
        }
        if (name === "stripe_checkout_company") {
          return { data: null, error: null };
        }
        return { data: null, error: null };
      });

      const { POST } = await import("@/app/api/webhooks/stripe/route");
      const res = await POST(makeRequest("raw-body") as never);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.received).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith("stripe_checkout_company", {
        p_organisation_id: "org-1",
        p_stripe_subscription_id: "sub_123",
        p_stripe_customer_id: "cus_123",
        p_plan: "pro",
      });
    });

    it("upgrades user role from free to premium via candidate checkout", async () => {
      const event = {
        id: "evt_checkout_candidate_1",
        type: "checkout.session.completed",
        data: {
          object: {
            subscription: "sub_cand_1",
            customer: "cus_cand_1",
            metadata: {
              type: "candidate",
              user_id: "user-1",
            },
          },
        },
      };

      mockConstructEvent.mockReturnValue(event);
      mockRpc.mockImplementation((name: string) => {
        if (name === "webhook_event_try_acquire") {
          return { data: true, error: null };
        }
        if (name === "stripe_checkout_candidate") {
          return { data: null, error: null };
        }
        return { data: null, error: null };
      });

      const { POST } = await import("@/app/api/webhooks/stripe/route");
      const res = await POST(makeRequest("body") as never);

      expect(res.status).toBe(200);
      expect(mockRpc).toHaveBeenCalledWith("stripe_checkout_candidate", {
        p_user_id: "user-1",
        p_stripe_subscription_id: "sub_cand_1",
        p_stripe_customer_id: "cus_cand_1",
      });
    });

    it("handles duplicate events idempotently", async () => {
      const event = {
        id: "evt_duplicate_1",
        type: "checkout.session.completed",
        data: {
          object: {
            subscription: "sub_dup",
            customer: "cus_dup",
            metadata: { type: "company", organisation_id: "org-1", plan: "pro" },
          },
        },
      };

      mockConstructEvent.mockReturnValue(event);
      // webhook_event_try_acquire returns false (already processed)
      mockRpc.mockImplementation((name: string) => {
        if (name === "webhook_event_try_acquire") {
          return { data: false, error: null };
        }
        return { data: null, error: null };
      });

      const { POST } = await import("@/app/api/webhooks/stripe/route");
      const res = await POST(makeRequest("body") as never);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.received).toBe(true);
      // stripe_checkout_company should NOT have been called
      expect(mockRpc.mock.calls.some((c: unknown[]) => c[0] === "stripe_checkout_company")).toBe(
        false,
      );
    });
  });

  describe("customer.subscription.deleted", () => {
    it("downgrades user to free tier when candidate subscription cancelled", async () => {
      const event = {
        id: "evt_sub_deleted_1",
        type: "customer.subscription.deleted",
        data: { object: { id: "sub_cand_del" } },
      };

      mockConstructEvent.mockReturnValue(event);
      mockRpc.mockImplementation((name: string) => {
        if (name === "webhook_event_try_acquire") {
          return { data: true, error: null };
        }
        return { data: null, error: null };
      });

      const subBuilder = chainableBuilder();
      subBuilder.single.mockResolvedValue({
        data: { organisation_id: null, user_id: "user-cand-1", candidate_plan: "pro" },
        error: null,
      });

      const profileBuilder = chainableBuilder();
      const orgBuilder = chainableBuilder();

      mockFrom.mockImplementation((table: string) => {
        if (table === "subscriptions") return subBuilder;
        if (table === "profiles") return profileBuilder;
        if (table === "organisations") return orgBuilder;
        return chainableBuilder();
      });

      const { POST } = await import("@/app/api/webhooks/stripe/route");
      const res = await POST(makeRequest("body") as never);

      expect(res.status).toBe(200);
      // Should update subscription status to cancelled
      expect(subBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "cancelled" }),
      );
      // Should downgrade profile role to candidate_free
      expect(profileBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({ role: "candidate_free" }),
      );
    });

    it("preserves user data on downgrade (only role and plan change)", async () => {
      const event = {
        id: "evt_sub_deleted_2",
        type: "customer.subscription.deleted",
        data: { object: { id: "sub_org_del" } },
      };

      mockConstructEvent.mockReturnValue(event);
      mockRpc.mockImplementation((name: string) => {
        if (name === "webhook_event_try_acquire") {
          return { data: true, error: null };
        }
        return { data: null, error: null };
      });

      const subBuilder = chainableBuilder();
      subBuilder.single.mockResolvedValue({
        data: { organisation_id: "org-1", user_id: null, candidate_plan: null },
        error: null,
      });

      const orgBuilder = chainableBuilder();

      mockFrom.mockImplementation((table: string) => {
        if (table === "subscriptions") return subBuilder;
        if (table === "organisations") return orgBuilder;
        return chainableBuilder();
      });

      const { POST } = await import("@/app/api/webhooks/stripe/route");
      const res = await POST(makeRequest("body") as never);

      expect(res.status).toBe(200);
      // Organisation should downgrade to starter plan, not delete data
      expect(orgBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({ company_plan: "starter" }),
      );
      // update call should NOT contain fields that delete user data
      const updateArg = orgBuilder.update.mock.calls[0][0];
      expect(updateArg).not.toHaveProperty("name");
      expect(updateArg).not.toHaveProperty("slug");
    });
  });

  describe("invoice.payment_failed", () => {
    it("sends payment failure notification by marking subscription past_due", async () => {
      const event = {
        id: "evt_inv_fail_1",
        type: "invoice.payment_failed",
        data: { object: { subscription: "sub_past_due" } },
      };

      mockConstructEvent.mockReturnValue(event);
      mockRpc.mockImplementation((name: string) => {
        if (name === "webhook_event_try_acquire") {
          return { data: true, error: null };
        }
        return { data: null, error: null };
      });

      const subBuilder = chainableBuilder();
      mockFrom.mockReturnValue(subBuilder);

      const { POST } = await import("@/app/api/webhooks/stripe/route");
      const res = await POST(makeRequest("body") as never);

      expect(res.status).toBe(200);
      expect(subBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "past_due" }),
      );
    });

    it("does not immediately downgrade on payment failure", async () => {
      const event = {
        id: "evt_inv_fail_2",
        type: "invoice.payment_failed",
        data: { object: { subscription: "sub_fail_no_downgrade" } },
      };

      mockConstructEvent.mockReturnValue(event);
      mockRpc.mockImplementation((name: string) => {
        if (name === "webhook_event_try_acquire") {
          return { data: true, error: null };
        }
        return { data: null, error: null };
      });

      const subBuilder = chainableBuilder();
      const profileBuilder = chainableBuilder();
      const orgBuilder = chainableBuilder();

      mockFrom.mockImplementation((table: string) => {
        if (table === "subscriptions") return subBuilder;
        if (table === "profiles") return profileBuilder;
        if (table === "organisations") return orgBuilder;
        return chainableBuilder();
      });

      const { POST } = await import("@/app/api/webhooks/stripe/route");
      const res = await POST(makeRequest("body") as never);

      expect(res.status).toBe(200);
      // Subscription should only be marked past_due
      expect(subBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "past_due" }),
      );
      // Profile should NOT be downgraded
      expect(profileBuilder.update).not.toHaveBeenCalled();
      // Organisation should NOT be downgraded
      expect(orgBuilder.update).not.toHaveBeenCalled();
    });
  });

  describe("signature verification", () => {
    it("returns 400 when stripe-signature header is missing", async () => {
      const req = new Request("http://localhost:3000/api/webhooks/stripe", {
        method: "POST",
        body: "raw-body",
      });

      const { POST } = await import("@/app/api/webhooks/stripe/route");
      const res = await POST(req as never);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Missing signature");
    });

    it("returns 400 when signature verification fails", async () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error("Invalid signature");
      });

      const { POST } = await import("@/app/api/webhooks/stripe/route");
      const res = await POST(makeRequest("body", "bad-sig") as never);

      expect(res.status).toBe(400);
    });
  });
});

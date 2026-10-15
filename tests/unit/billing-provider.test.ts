import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIsEnabled = vi.fn();

vi.mock("@/lib/feature-flags", () => ({
  isEnabled: (...args: unknown[]) => mockIsEnabled(...args),
}));

vi.mock("@/lib/config/env", () => ({
  env: {
    razorpayKeyId: "rzp_key",
    razorpayKeySecret: "rzp_secret",
    razorpayWebhookSecret: "rzp_webhook_secret",
    billingDefaultProvider: "razorpay",
    billingForceStripe: false,
  },
}));

describe("billing-provider helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back paid company plans to starter when subscription inactive", async () => {
    const { effectiveCompanyPlan } = await import("@/lib/services/billing-provider");
    expect(
      effectiveCompanyPlan({
        plan: "growth",
        subscriptionStatus: "cancelled",
      }),
    ).toBe("starter");
  });

  it("keeps paid plan when subscription is active", async () => {
    const { effectiveCompanyPlan } = await import("@/lib/services/billing-provider");
    expect(
      effectiveCompanyPlan({
        plan: "scale",
        subscriptionStatus: "active",
      }),
    ).toBe("scale");
  });

  it("resolves razorpay when flag enabled", async () => {
    mockIsEnabled.mockResolvedValue(true);
    const { resolveCheckoutProvider } = await import("@/lib/services/billing-provider");
    await expect(resolveCheckoutProvider("org-1")).resolves.toBe("razorpay");
  });

  it("resolves stripe when org flag disabled", async () => {
    mockIsEnabled.mockResolvedValue(false);
    const { resolveCheckoutProvider } = await import("@/lib/services/billing-provider");
    await expect(resolveCheckoutProvider("org-1")).resolves.toBe("stripe");
  });
});

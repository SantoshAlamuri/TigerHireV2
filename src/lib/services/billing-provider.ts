import { env } from "@/lib/config/env";
import { isEnabled } from "@/lib/feature-flags";

export type BillingProvider = "stripe" | "razorpay";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "authenticated", "created"]);

const COMPANY_PAID_PLANS = new Set(["growth", "scale", "enterprise"]);

export function normalizeSubscriptionStatus(status: string | null | undefined): string {
  return (status ?? "").trim().toLowerCase();
}

export function isSubscriptionActive(status: string | null | undefined): boolean {
  return ACTIVE_SUBSCRIPTION_STATUSES.has(normalizeSubscriptionStatus(status));
}

export function companyPlanRequiresActiveSubscription(plan: string | null | undefined): boolean {
  return COMPANY_PAID_PLANS.has((plan ?? "").trim().toLowerCase());
}

export function effectiveCompanyPlan(params: {
  plan: string | null | undefined;
  subscriptionStatus: string | null | undefined;
}): string {
  const normalizedPlan = (params.plan ?? "starter").trim().toLowerCase() || "starter";
  if (!companyPlanRequiresActiveSubscription(normalizedPlan)) {
    return normalizedPlan;
  }
  return isSubscriptionActive(params.subscriptionStatus) ? normalizedPlan : "starter";
}

function isRazorpayConfigured(): boolean {
  return Boolean(env.razorpayKeyId && env.razorpayKeySecret && env.razorpayWebhookSecret);
}

export async function resolveCheckoutProvider(
  organisationId: string | null | undefined,
): Promise<BillingProvider> {
  if (env.billingForceStripe) return "stripe";
  if (!isRazorpayConfigured()) return "stripe";
  if (env.billingDefaultProvider !== "razorpay") return "stripe";

  const razorpayFlagEnabled = await isEnabled("billing_provider_razorpay", organisationId ?? null);
  return razorpayFlagEnabled ? "razorpay" : "stripe";
}

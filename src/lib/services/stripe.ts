import Stripe from "stripe";
import { env } from "@/lib/config/env";
import { getCorrelationId } from "@/lib/observability/correlation";
import { createResilientCall } from "@/lib/utils/resilient-call";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { BillingProvider } from "@/lib/services/billing-provider";
import { ENTITLEMENT_FEATURE_KEYS, type EntitlementFeatureKey } from "@/lib/entitlements/config";

const stripeCall = createResilientCall({
  service: "stripe",
  timeoutMs: 30_000,
  maxRetries: 2,
});

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(env.stripeSecretKey);
  }
  return _stripe;
}

function defaultPlanFeatures(): Record<EntitlementFeatureKey, boolean> {
  return ENTITLEMENT_FEATURE_KEYS.reduce(
    (acc, key) => {
      acc[key] = true;
      return acc;
    },
    {} as Record<EntitlementFeatureKey, boolean>,
  );
}

export const COMPANY_PLANS: Record<
  string,
  {
    priceId: string;
    stripePriceId: string;
    razorpayPlanId: string;
    name: string;
    unlocks: number;
    features: Record<EntitlementFeatureKey, boolean>;
  }
> = {
  starter: {
    priceId: process.env.STRIPE_PRICE_STARTER ?? "",
    stripePriceId: process.env.STRIPE_PRICE_STARTER ?? "",
    razorpayPlanId: process.env.RAZORPAY_PLAN_STARTER ?? "",
    name: "Starter",
    unlocks: 15,
    features: defaultPlanFeatures(),
  },
  growth: {
    priceId: process.env.STRIPE_PRICE_GROWTH ?? "",
    stripePriceId: process.env.STRIPE_PRICE_GROWTH ?? "",
    razorpayPlanId: process.env.RAZORPAY_PLAN_GROWTH ?? "",
    name: "Growth",
    unlocks: 50,
    features: defaultPlanFeatures(),
  },
  scale: {
    priceId: process.env.STRIPE_PRICE_SCALE ?? "",
    stripePriceId: process.env.STRIPE_PRICE_SCALE ?? "",
    razorpayPlanId: process.env.RAZORPAY_PLAN_SCALE ?? "",
    name: "Scale",
    unlocks: -1, // unlimited
    features: defaultPlanFeatures(),
  },
};

export const CANDIDATE_PLANS: Record<
  string,
  { priceId: string; stripePriceId: string; razorpayPlanId: string; name: string }
> = {
  pro: {
    priceId: process.env.STRIPE_PRICE_CANDIDATE_PRO ?? "",
    stripePriceId: process.env.STRIPE_PRICE_CANDIDATE_PRO ?? "",
    razorpayPlanId: process.env.RAZORPAY_PLAN_CANDIDATE_PRO ?? "",
    name: "Pro",
  },
};

export type BillingPlans = {
  company: Record<
    string,
    {
      priceId: string;
      stripePriceId: string;
      razorpayPlanId: string;
      name: string;
      unlocks: number;
      features: Record<EntitlementFeatureKey, boolean>;
    }
  >;
  candidate: Record<
    string,
    { priceId: string; stripePriceId: string; razorpayPlanId: string; name: string }
  >;
};

/**
 * Load plan config from DB (billing_plans table); falls back to env when table empty or on error.
 */
export async function getBillingPlans(): Promise<BillingPlans> {
  try {
    const db = createSupabaseAdmin();
    const { data: rows } = await db
      .from("billing_plans")
      .select("plan_key, plan_type, stripe_price_id, razorpay_plan_id, name, limits");

    if (!rows?.length) return envBillingPlans();

    const company: Record<
      string,
      {
        priceId: string;
        stripePriceId: string;
        razorpayPlanId: string;
        name: string;
        unlocks: number;
        features: Record<EntitlementFeatureKey, boolean>;
      }
    > = {};
    const candidate: Record<
      string,
      { priceId: string; stripePriceId: string; razorpayPlanId: string; name: string }
    > = {};

    const envPlans = envBillingPlans();
    for (const r of rows as Array<{
      plan_key: string;
      plan_type: string;
      stripe_price_id: string;
      razorpay_plan_id: string;
      name: string;
      limits: {
        unlocks?: number;
        features?: Partial<Record<EntitlementFeatureKey, boolean>>;
      } | null;
    }>) {
      if (r.plan_type === "company") {
        const envCompany = envPlans.company[r.plan_key as keyof typeof envPlans.company];
        const defaultFeatures = envCompany?.features ?? defaultPlanFeatures();
        const stripePriceId =
          (r.stripe_price_id?.trim() ? r.stripe_price_id : envCompany?.stripePriceId) ?? "";
        const razorpayPlanId =
          (r.razorpay_plan_id?.trim() ? r.razorpay_plan_id : envCompany?.razorpayPlanId) ?? "";
        const planFeatures = ENTITLEMENT_FEATURE_KEYS.reduce(
          (acc, key) => {
            const fromDb = r.limits?.features?.[key];
            const fallback = defaultFeatures[key];
            acc[key] = typeof fromDb === "boolean" ? fromDb : fallback;
            return acc;
          },
          {} as Record<EntitlementFeatureKey, boolean>,
        );
        company[r.plan_key] = {
          priceId: stripePriceId,
          stripePriceId,
          razorpayPlanId,
          name: r.name,
          unlocks: r.limits?.unlocks ?? envCompany?.unlocks ?? -1,
          features: planFeatures,
        };
      } else {
        const envCandidate = envPlans.candidate[r.plan_key as keyof typeof envPlans.candidate];
        const stripePriceId =
          (r.stripe_price_id?.trim() ? r.stripe_price_id : envCandidate?.stripePriceId) ?? "";
        const razorpayPlanId =
          (r.razorpay_plan_id?.trim() ? r.razorpay_plan_id : envCandidate?.razorpayPlanId) ?? "";
        candidate[r.plan_key] = {
          priceId: stripePriceId,
          stripePriceId,
          razorpayPlanId,
          name: r.name,
        };
      }
    }

    if (Object.keys(company).length || Object.keys(candidate).length) {
      return {
        company: Object.keys(company).length ? company : envPlans.company,
        candidate: Object.keys(candidate).length ? candidate : envPlans.candidate,
      };
    }
  } catch {
    // fall through to env
  }
  return envBillingPlans();
}

function envBillingPlans(): BillingPlans {
  return {
    company: { ...COMPANY_PLANS },
    candidate: { ...CANDIDATE_PLANS },
  };
}

/** Default unlock limit when plan is missing or not in billing_plans (e.g. free tier). */
const DEFAULT_UNLOCK_LIMIT = 5;

/**
 * Get the monthly profile-unlock credit limit for a company plan.
 * Reads from billing_plans (DB); platform admin can change limits there without code deploy.
 * Returns -1 for unlimited.
 */
export async function getCompanyPlanUnlockLimit(plan: string): Promise<number> {
  const plans = await getBillingPlans();
  const limit = plans.company[plan]?.unlocks;
  if (limit === undefined) return DEFAULT_UNLOCK_LIMIT;
  return limit;
}

export function getProviderPlanId(
  plan: { stripePriceId: string; razorpayPlanId: string } | undefined,
  provider: BillingProvider,
): string {
  if (!plan) return "";
  return provider === "razorpay" ? plan.razorpayPlanId : plan.stripePriceId;
}

export async function createCheckoutSession(params: {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  const correlationId = getCorrelationId();
  const metadata = {
    ...params.metadata,
    ...(correlationId && { request_id: correlationId }),
  };
  return stripeCall(
    () =>
      stripe.checkout.sessions.create({
        customer: params.customerId,
        mode: "subscription",
        line_items: [{ price: params.priceId, quantity: 1 }],
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: Object.keys(metadata).length ? metadata : undefined,
      }),
    "createCheckoutSession",
  );
}

export async function createCustomer(params: {
  email: string;
  name: string;
  metadata?: Record<string, string>;
}): Promise<Stripe.Customer> {
  const stripe = getStripe();
  const correlationId = getCorrelationId();
  const metadata = {
    ...params.metadata,
    ...(correlationId && { request_id: correlationId }),
  };
  return stripeCall(
    () =>
      stripe.customers.create({
        email: params.email,
        name: params.name,
        metadata: Object.keys(metadata).length ? metadata : undefined,
      }),
    "createCustomer",
  );
}

export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string,
): Promise<Stripe.BillingPortal.Session> {
  const stripe = getStripe();
  return stripeCall(
    () =>
      stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      }),
    "createBillingPortalSession",
  );
}

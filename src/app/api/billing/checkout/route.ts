import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createCheckoutSession,
  createCustomer,
  getBillingPlans,
  getProviderPlanId,
} from "@/lib/services/stripe";
import { createRazorpaySubscriptionCheckout } from "@/lib/services/razorpay";
import { resolveCheckoutProvider } from "@/lib/services/billing-provider";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { env } from "@/lib/config/env";
import { validateOrigin } from "@/lib/security/csrf";
import { withIdempotency } from "@/lib/security/idempotency";
import { logger } from "@/lib/observability/logger";
import { z } from "zod";

const checkoutSchema = z
  .object({
    plan: z.string(),
    type: z.enum(["company", "candidate"]),
  })
  .strict();

const CHECKOUT_ENDPOINT = "POST /api/billing/checkout";

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  return withIdempotency(request, CHECKOUT_ENDPOINT, async () => {
    try {
      const ctx = await getAuthContext();
      if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

      const parsedBody = await parseJsonBody(request, "POST /api/billing/checkout");
      if (parsedBody.errorResponse) return parsedBody.errorResponse;
      const parsed = checkoutSchema.safeParse(parsedBody.body);
      if (!parsed.success) return jsonError("Invalid plan selection", 400);

      const { plan, type } = parsed.data;
      const supabase = await createSupabaseServerClient();
      const plans = await getBillingPlans();
      const provider = await resolveCheckoutProvider(
        type === "company" ? ctx.organisationId : null,
      );
      logger.info("Billing checkout provider resolved", {
        provider,
        billing_type: type,
        plan,
        org_id: ctx.organisationId,
        user_id: ctx.userId,
      });

      let planId: string;
      let metadata: Record<string, string>;

      if (type === "company") {
        if (!hasRole(ctx, "leadership")) {
          return jsonError("Only company admins can purchase plans", 403);
        }
        if (!ctx.organisationId) {
          return jsonError("No organisation found", 400);
        }
        const planConfig = plans.company[plan];
        planId = getProviderPlanId(planConfig, provider);
        if (!planId) {
          return jsonError(`Invalid company plan for ${provider}`, 400);
        }

        metadata = {
          type: "company",
          organisation_id: ctx.organisationId,
          plan,
          provider,
        };
      } else {
        if (!hasRole(ctx, "candidate_free")) {
          return jsonError("Already on a paid plan", 400);
        }
        const planConfig = plans.candidate[plan];
        planId = getProviderPlanId(planConfig, provider);
        if (!planId) {
          return jsonError(`Invalid candidate plan for ${provider}`, 400);
        }

        metadata = {
          type: "candidate",
          user_id: ctx.userId,
          plan,
          provider,
        };
      }

      if (provider === "razorpay") {
        const subscription = await createRazorpaySubscriptionCheckout({
          planId,
          metadata,
        });
        logger.info("Billing checkout URL created", {
          provider: "razorpay",
          billing_type: type,
          plan,
          checkout_id: subscription.subscriptionId,
          org_id: ctx.organisationId,
          user_id: ctx.userId,
        });
        return jsonSuccess({
          url: subscription.url,
          provider: "razorpay",
          checkoutId: subscription.subscriptionId,
        });
      }

      // Get or create Stripe customer
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", ctx.userId)
        .single();

      const { data: user } = await supabase.auth.getUser();
      const email = user?.user?.email ?? "";

      // Check for existing Stripe customer
      let stripeCustomerId: string | null = null;

      if (type === "company" && ctx.organisationId) {
        const { data: org } = await supabase
          .from("organisations")
          .select("stripe_customer_id")
          .eq("id", ctx.organisationId)
          .single();
        stripeCustomerId = org?.stripe_customer_id ?? null;
      }

      if (!stripeCustomerId) {
        const customer = await createCustomer({
          email,
          name: profile?.full_name ?? email,
          metadata,
        });
        stripeCustomerId = customer.id;

        // Save customer ID
        if (type === "company" && ctx.organisationId) {
          await supabase
            .from("organisations")
            .update({ stripe_customer_id: stripeCustomerId })
            .eq("id", ctx.organisationId);
        }
      }

      const session = await createCheckoutSession({
        customerId: stripeCustomerId,
        priceId: planId,
        successUrl: `${env.baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${env.baseUrl}/billing/cancelled`,
        metadata,
      });
      logger.info("Billing checkout URL created", {
        provider: "stripe",
        billing_type: type,
        plan,
        checkout_id: session.id,
        org_id: ctx.organisationId,
        user_id: ctx.userId,
      });

      return jsonSuccess({ url: session.url, provider: "stripe", checkoutId: session.id });
    } catch (err) {
      return handleApiError(err, "Failed to create checkout session", {
        route: CHECKOUT_ENDPOINT,
      });
    }
  });
}

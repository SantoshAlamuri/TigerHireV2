import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";
import { reportError } from "@/lib/observability/report-error";
import { invalidateOrganisationEntitlement } from "@/lib/entitlements";
import { getStripe } from "@/lib/services/stripe";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type Stripe from "stripe";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig) {
    logger.warn("Stripe webhook rejected: missing signature");
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, sig, env.stripeWebhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Signature verification failed";
    logger.error("Stripe webhook verification failed", { error: message });
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  const { data: acquired } = await admin.rpc("webhook_event_try_acquire", {
    p_provider: "stripe",
    p_event_id: event.id,
  });
  if (acquired === false) {
    logger.info("Stripe webhook duplicate skipped", { event_id: event.id, event_type: event.type });
    return NextResponse.json({ received: true });
  }

  try {
    logger.info("Stripe webhook processing", { event_id: event.id, event_type: event.type });
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const metadata = session.metadata ?? {};

        if (metadata.type === "company") {
          await admin.rpc("stripe_checkout_company", {
            p_organisation_id: metadata.organisation_id,
            p_stripe_subscription_id: session.subscription as string,
            p_stripe_customer_id: session.customer as string,
            p_plan: metadata.plan as string,
          });
        } else if (metadata.type === "candidate") {
          await admin.rpc("stripe_checkout_candidate", {
            p_user_id: metadata.user_id,
            p_stripe_subscription_id: session.subscription as string,
            p_stripe_customer_id: session.customer as string,
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const normalizedStatus = subscription.status === "active" ? "active" : "inactive";
        await admin
          .from("subscriptions")
          .update({
            status: normalizedStatus,
            provider: "stripe",
            provider_customer_id:
              typeof subscription.customer === "string" ? subscription.customer : null,
            provider_subscription_id: subscription.id,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subscription.id);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;

        const { data: sub } = await admin
          .from("subscriptions")
          .select("organisation_id, user_id, candidate_plan")
          .eq("stripe_subscription_id", subscription.id)
          .single();

        if (sub) {
          await admin
            .from("subscriptions")
            .update({
              status: "cancelled",
              provider: "stripe",
              provider_customer_id:
                typeof subscription.customer === "string" ? subscription.customer : null,
              provider_subscription_id: subscription.id,
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_subscription_id", subscription.id);

          // Downgrade candidate if applicable
          if (sub.user_id && sub.candidate_plan === "pro") {
            await admin
              .from("profiles")
              .update({
                role: "candidate_free",
                updated_at: new Date().toISOString(),
              })
              .eq("id", sub.user_id);
          }

          // Downgrade org plan if applicable
          if (sub.organisation_id) {
            await admin
              .from("organisations")
              .update({
                company_plan: "starter",
                updated_at: new Date().toISOString(),
              })
              .eq("id", sub.organisation_id);
            await invalidateOrganisationEntitlement(sub.organisation_id);
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice & {
          subscription?: string;
        };
        if (invoice.subscription) {
          await admin
            .from("subscriptions")
            .update({
              status: "past_due",
              provider: "stripe",
              provider_subscription_id: invoice.subscription,
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_subscription_id", invoice.subscription);
        }
        break;
      }
    }
  } catch (err) {
    reportError(err, { route: "/api/webhooks/stripe" });
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

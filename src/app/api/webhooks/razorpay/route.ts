import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/observability/logger";
import { reportError } from "@/lib/observability/report-error";
import { verifyRazorpayWebhookSignature } from "@/lib/services/razorpay";
import {
  companyPlanRequiresActiveSubscription,
  effectiveCompanyPlan,
  normalizeSubscriptionStatus,
} from "@/lib/services/billing-provider";
import { invalidateOrganisationEntitlement } from "@/lib/entitlements";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type RazorpayWebhookBody = {
  event?: string;
  created_at?: number;
  payload?: {
    subscription?: {
      entity?: {
        id?: string;
        customer_id?: string;
        status?: string;
        notes?: Record<string, string | undefined>;
      };
    };
    payment?: {
      entity?: {
        id?: string;
        subscription_id?: string;
        customer_id?: string;
        notes?: Record<string, string | undefined>;
      };
    };
  };
};

function mapRazorpayToSubscriptionStatus(
  eventType: string | undefined,
  subscriptionStatus: string | undefined,
): string {
  const normalized = normalizeSubscriptionStatus(subscriptionStatus);
  if (eventType === "payment.failed") return "past_due";
  if (normalized === "active" || normalized === "authenticated" || normalized === "created") {
    return "active";
  }
  if (normalized === "pending" || normalized === "halted" || normalized === "paused") {
    return "past_due";
  }
  if (normalized === "cancelled" || normalized === "completed") {
    return "cancelled";
  }
  return normalized || "inactive";
}

function parseNotes(payload: RazorpayWebhookBody): Record<string, string> {
  const notes =
    payload.payload?.subscription?.entity?.notes ?? payload.payload?.payment?.entity?.notes ?? {};
  return Object.entries(notes).reduce(
    (acc, [key, value]) => {
      const next = (value ?? "").trim();
      if (next) acc[key] = next;
      return acc;
    },
    {} as Record<string, string>,
  );
}

function resolveWebhookEventId(request: NextRequest, payload: RazorpayWebhookBody): string {
  const headerEventId = request.headers.get("x-razorpay-event-id")?.trim();
  if (headerEventId) return headerEventId;
  const subscriptionId =
    payload.payload?.subscription?.entity?.id ?? payload.payload?.payment?.entity?.subscription_id;
  return [
    payload.event ?? "unknown",
    subscriptionId ?? "no_subscription",
    String(payload.created_at ?? Date.now()),
  ].join(":");
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");
  if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
    logger.warn("Razorpay webhook rejected: invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: RazorpayWebhookBody;
  try {
    payload = JSON.parse(rawBody) as RazorpayWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const eventType = payload.event;
  const notes = parseNotes(payload);
  const subscriptionEntity = payload.payload?.subscription?.entity;
  const paymentEntity = payload.payload?.payment?.entity;
  const providerSubscriptionId = subscriptionEntity?.id ?? paymentEntity?.subscription_id ?? null;
  const providerCustomerId = subscriptionEntity?.customer_id ?? paymentEntity?.customer_id ?? null;
  const normalizedStatus = mapRazorpayToSubscriptionStatus(eventType, subscriptionEntity?.status);

  const admin = createSupabaseAdmin();
  const acquired = await admin.rpc("webhook_event_try_acquire", {
    p_provider: "razorpay",
    p_event_id: resolveWebhookEventId(request, payload),
  });
  if (acquired.data === false) {
    logger.info("Razorpay webhook duplicate skipped", {
      event_type: eventType,
      event_id: resolveWebhookEventId(request, payload),
    });
    return NextResponse.json({ received: true });
  }

  try {
    logger.info("Razorpay webhook processing", {
      event_type: eventType,
      provider_subscription_id: providerSubscriptionId,
    });
    const type = notes.type;
    const plan = notes.plan ?? "starter";

    if (type === "company" && notes.organisation_id) {
      const organisationId = notes.organisation_id;
      const subscriptionPlan = effectiveCompanyPlan({
        plan,
        subscriptionStatus: normalizedStatus,
      });

      await admin.from("subscriptions").upsert(
        {
          organisation_id: organisationId,
          company_plan: subscriptionPlan,
          status: normalizedStatus,
          provider: "razorpay",
          provider_customer_id: providerCustomerId,
          provider_subscription_id: providerSubscriptionId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organisation_id" },
      );

      await admin
        .from("organisations")
        .update({
          company_plan:
            normalizedStatus === "active" || !companyPlanRequiresActiveSubscription(plan)
              ? plan
              : "starter",
          updated_at: new Date().toISOString(),
        })
        .eq("id", organisationId);

      await invalidateOrganisationEntitlement(organisationId);
    } else if (type === "candidate" && notes.user_id) {
      const userId = notes.user_id;
      const candidatePlan = normalizedStatus === "active" ? "pro" : null;
      await admin.from("subscriptions").upsert(
        {
          user_id: userId,
          candidate_plan: candidatePlan,
          status: normalizedStatus,
          provider: "razorpay",
          provider_customer_id: providerCustomerId,
          provider_subscription_id: providerSubscriptionId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

      await admin
        .from("profiles")
        .update({
          role: normalizedStatus === "active" ? "candidate_pro" : "candidate_free",
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
    } else {
      logger.warn("Razorpay webhook ignored due to missing routing metadata", {
        event_type: eventType,
      });
    }
  } catch (err) {
    reportError(err, { route: "/api/webhooks/razorpay", eventType });
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

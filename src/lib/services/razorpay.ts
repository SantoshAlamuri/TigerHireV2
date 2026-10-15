import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";
import { env } from "@/lib/config/env";
import { getCorrelationId } from "@/lib/observability/correlation";
import { createResilientCall } from "@/lib/utils/resilient-call";

const razorpayCall = createResilientCall({
  service: "razorpay",
  timeoutMs: 30_000,
  maxRetries: 2,
});

let _razorpay: Razorpay | null = null;

export function getRazorpay(): Razorpay {
  if (!_razorpay) {
    if (!env.razorpayKeyId || !env.razorpayKeySecret) {
      throw new Error("Razorpay keys are not configured");
    }
    _razorpay = new Razorpay({
      key_id: env.razorpayKeyId,
      key_secret: env.razorpayKeySecret,
    });
  }
  return _razorpay;
}

function sanitizeNotes(notes?: Record<string, string>): Record<string, string> | undefined {
  if (!notes) return undefined;
  const cleaned = Object.entries(notes).reduce(
    (acc, [key, value]) => {
      const k = key.trim();
      const v = String(value ?? "").trim();
      if (!k || !v) return acc;
      acc[k.slice(0, 255)] = v.slice(0, 255);
      return acc;
    },
    {} as Record<string, string>,
  );
  return Object.keys(cleaned).length ? cleaned : undefined;
}

export async function createRazorpaySubscriptionCheckout(params: {
  planId: string;
  metadata?: Record<string, string>;
  totalCount?: number;
}): Promise<{ subscriptionId: string; url: string; status: string }> {
  const razorpay = getRazorpay();
  const correlationId = getCorrelationId();
  const notes = sanitizeNotes({
    ...params.metadata,
    ...(correlationId ? { request_id: correlationId } : {}),
  });

  const subscription = await razorpayCall(
    () =>
      razorpay.subscriptions.create({
        plan_id: params.planId,
        total_count: params.totalCount ?? 120,
        customer_notify: 1,
        notes,
      }),
    "createRazorpaySubscriptionCheckout",
  );

  if (!subscription.short_url) {
    throw new Error("Razorpay subscription response missing short_url");
  }

  return {
    subscriptionId: subscription.id,
    url: subscription.short_url,
    status: subscription.status,
  };
}

export async function createRazorpayInvoice(params: {
  customerId: string;
  amountInr: number;
  description: string;
  metadata?: Record<string, string>;
  lineItemName?: string;
}): Promise<{ invoiceId: string; status: string; shortUrl: string | null }> {
  const razorpay = getRazorpay();
  const correlationId = getCorrelationId();
  const amountPaise = Math.round(Math.max(0, params.amountInr) * 100);
  if (amountPaise <= 0) {
    throw new Error("Razorpay invoice amount must be greater than zero");
  }

  const notes = sanitizeNotes({
    ...params.metadata,
    ...(correlationId ? { request_id: correlationId } : {}),
  });

  const invoice = await razorpayCall(
    () =>
      razorpay.invoices.create({
        type: "invoice",
        currency: "INR",
        customer_id: params.customerId,
        line_items: [
          {
            name: params.lineItemName ?? "Voice screening",
            amount: amountPaise,
            currency: "INR",
            quantity: 1,
          },
        ],
        description: params.description,
        notes,
      }),
    "createRazorpayInvoice",
  );

  return {
    invoiceId: invoice.id,
    status: invoice.status ?? "created",
    shortUrl: invoice.short_url ?? null,
  };
}

export function verifyRazorpayWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = env.razorpayWebhookSecret;
  const received = (signature ?? "").trim();
  if (!secret || !received) return false;

  const computed = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  try {
    const a = Buffer.from(received, "hex");
    const b = Buffer.from(computed, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

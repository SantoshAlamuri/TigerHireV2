import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRedis } from "@/lib/redis";
import { getCacheMetrics } from "@/lib/redis/cache";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";
import { reportError } from "@/lib/observability/report-error";
import { withCorrelation } from "@/lib/observability/with-correlation";
import { withRouteSpan } from "@/lib/observability/route-span";

/**
 * GET /api/health — Liveness probe.
 * Returns 200 with { ok: true }.
 *
 * GET /api/health?ready=1 — Readiness probe.
 * Pings Supabase; returns 503 if DB unreachable, 200 otherwise.
 *
 * GET /api/health?ready=1&deps=1 — Readiness + optional dependency checks
 * (Stripe, Anthropic, WhatsApp). Failures on deps do not force 503;
 * they are reported in the response for debugging.
 */
export const GET = withCorrelation(async (request: NextRequest) =>
  withRouteSpan("GET /api/health", async () => {
    const ready = request.nextUrl.searchParams.get("ready") === "1";
    const checkDeps = request.nextUrl.searchParams.get("deps") === "1";

    if (!ready) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const deps: Record<string, boolean> = {};

    try {
      const supabase = createSupabaseAdmin();
      const { error } = await supabase.from("profiles").select("id").limit(1).maybeSingle();
      if (error) {
        return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });
      }
    } catch (err) {
      reportError(err, { route: "GET /api/health", ready: true });
      return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });
    }

    if (checkDeps) {
      const signal = request.signal;
      deps.stripe = await checkStripe(signal);
      deps.anthropic = await checkAnthropic(signal);
      deps.whatsapp = await checkWhatsApp(signal);
      deps.redis = await checkRedis();
    }

    const body: Record<string, unknown> = { ok: true };
    if (checkDeps) body.deps = deps;
    body.cache = getCacheMetrics();

    return NextResponse.json(body, { status: 200 });
  }),
);

async function checkStripe(signal?: AbortSignal): Promise<boolean> {
  if (!env.stripeSecretKey) return false;
  try {
    const res = await fetch("https://api.stripe.com/v1/balance", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.stripeSecretKey}`,
      },
      signal: signal
        ? AbortSignal.any([AbortSignal.timeout(5_000), signal])
        : AbortSignal.timeout(5_000),
    });
    return res.ok;
  } catch {
    logger.debug("Stripe health check failed");
    return false;
  }
}

/** On 400, check if it's the credit/billing error so health can report it. */
function isAnthropicCreditErrorBody(body: string): boolean {
  try {
    const j = JSON.parse(body) as { error?: { message?: string } };
    const msg = j?.error?.message ?? "";
    return /credit balance|Plans & Billing|upgrade or purchase credits/i.test(msg);
  } catch {
    return false;
  }
}

async function checkAnthropic(signal?: AbortSignal): Promise<boolean> {
  if (!env.anthropicApiKey) return false;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.anthropicApiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
      signal: signal
        ? AbortSignal.any([AbortSignal.timeout(5_000), signal])
        : AbortSignal.timeout(5_000),
    });
    if (res.ok) return true;
    if (res.status === 400) {
      const text = await res.text();
      if (isAnthropicCreditErrorBody(text)) return false; // Key has no credits or wrong org
    }
    return false;
  } catch {
    logger.debug("Anthropic health check failed");
    return false;
  }
}

async function checkWhatsApp(_signal?: AbortSignal): Promise<boolean> {
  return Boolean(env.whatsappAccessToken.trim() && env.whatsappPhoneNumberId.trim());
}

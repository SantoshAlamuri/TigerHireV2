import { createHash } from "node:crypto";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";
import { recordPlatformCostEvent } from "@/lib/costs/ledger";
import { getStripe } from "@/lib/services/stripe";

export interface SyncWindow {
  from: Date;
  to: Date;
}

export interface ProviderSyncResult {
  provider: string;
  imported: number;
  skipped: boolean;
  reason?: string;
}

function numberFromUnknown(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = numberFromUnknown(obj[key]);
    if (value != null) return value;
  }
  return null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function hashExternalId(prefix: string, input: string): string {
  return `${prefix}:${createHash("sha256").update(input).digest("hex").slice(0, 40)}`;
}

export async function syncAllPlatformCosts(window: SyncWindow): Promise<ProviderSyncResult[]> {
  const [vercel, supabase, anthropic, stripe, meta, upstash, resend] = await Promise.all([
    syncVercelCharges(window),
    syncSupabaseUsage(window),
    syncAnthropicCostReport(window),
    syncStripeFees(window),
    syncMetaWhatsAppCosts(window),
    syncUpstashUsage(window),
    syncResendUsage(window),
  ]);
  return [vercel, supabase, anthropic, stripe, meta, upstash, resend];
}

export async function syncVercelCharges(window: SyncWindow): Promise<ProviderSyncResult> {
  if (!env.vercelApiToken) {
    return { provider: "vercel", imported: 0, skipped: true, reason: "VERCEL_API_TOKEN missing" };
  }

  const params = new URLSearchParams({
    from: window.from.toISOString(),
    to: window.to.toISOString(),
  });
  if (env.vercelTeamId) params.set("teamId", env.vercelTeamId);
  if (env.vercelTeamSlug) params.set("slug", env.vercelTeamSlug);

  const res = await fetch(`https://api.vercel.com/v1/billing/charges?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${env.vercelApiToken}`,
      Accept: "application/json, application/x-ndjson",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    logger.error("Vercel billing sync failed", { status: res.status, statusText: res.statusText });
    return {
      provider: "vercel",
      imported: 0,
      skipped: true,
      reason: `HTTP ${res.status}`,
    };
  }

  const raw = await res.text();
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  let imported = 0;

  for (const line of lines) {
    let row: Record<string, unknown> = {};
    try {
      row = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const amount =
      pickNumber(row, ["amount", "amount_usd", "cost", "billed_cost", "effective_cost"]) ??
      pickNumber(asObject(row["pricing"]), ["amount", "amount_usd", "cost"]);
    if (amount == null || amount < 0) continue;

    const occurredAt =
      (row["occurred_at"] as string) ||
      (row["usage_at"] as string) ||
      (row["date"] as string) ||
      window.to.toISOString();
    const externalId =
      (row["id"] as string) || hashExternalId("vercel", `${occurredAt}:${amount}:${line}`);
    const service = (row["service"] as string) || (row["product"] as string) || "platform";

    await recordPlatformCostEvent({
      provider: "vercel",
      service,
      category: "infrastructure",
      externalId,
      occurredAt,
      quantity: 1,
      unit: "charge",
      amountUsd: amount,
      status: "invoiced",
      metadata: row,
    });
    imported += 1;
  }

  return { provider: "vercel", imported, skipped: false };
}

export async function syncSupabaseUsage(window: SyncWindow): Promise<ProviderSyncResult> {
  if (!env.supabaseManagementToken || !env.supabaseProjectRef) {
    const missing: string[] = [];
    if (!env.supabaseManagementToken) missing.push("SUPABASE_MANAGEMENT_TOKEN");
    if (!env.supabaseProjectRef) missing.push("SUPABASE_PROJECT_REF");
    return {
      provider: "supabase",
      imported: 0,
      skipped: true,
      reason: `${missing.join(", ")} missing`,
    };
  }

  const params = new URLSearchParams({
    from: window.from.toISOString(),
    to: window.to.toISOString(),
  });
  const endpoint = `https://api.supabase.com/v1/projects/${env.supabaseProjectRef}/usage/request-count?${params.toString()}`;
  const res = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${env.supabaseManagementToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    logger.warn("Supabase usage sync request failed", { status: res.status, endpoint });
    return {
      provider: "supabase",
      imported: 0,
      skipped: true,
      reason: `HTTP ${res.status}`,
    };
  }

  const json = (await res.json()) as Record<string, unknown>;
  const count =
    pickNumber(json, ["total_requests", "request_count", "count", "total"]) ??
    pickNumber(asObject(json["usage"]), ["request_count", "total_requests"]) ??
    0;
  const estimatedUsd = (count / 1_000_000) * env.supabaseUsdPerMillionRequests;

  await recordPlatformCostEvent({
    provider: "supabase",
    service: "request_count",
    category: "infrastructure",
    externalId: hashExternalId(
      "supabase",
      `${window.from.toISOString()}:${window.to.toISOString()}`,
    ),
    occurredAt: window.to.toISOString(),
    quantity: count,
    unit: "requests",
    amountUsd: Number(estimatedUsd.toFixed(8)),
    status: "estimated",
    metadata: {
      source: "management_api",
      endpoint,
      raw: json,
      usd_per_million_requests: env.supabaseUsdPerMillionRequests,
    },
  });

  return { provider: "supabase", imported: 1, skipped: false };
}

export async function syncAnthropicCostReport(window: SyncWindow): Promise<ProviderSyncResult> {
  if (!env.anthropicAdminApiKey) {
    return {
      provider: "anthropic",
      imported: 0,
      skipped: true,
      reason: "ANTHROPIC_ADMIN_API_KEY missing",
    };
  }

  const params = new URLSearchParams({
    starting_at: window.from.toISOString(),
    ending_at: window.to.toISOString(),
    bucket_width: "1d",
  });
  const endpoint = `https://api.anthropic.com/v1/organizations/cost_report?${params.toString()}`;
  const res = await fetch(endpoint, {
    headers: {
      "x-api-key": env.anthropicAdminApiKey,
      "anthropic-version": "2023-06-01",
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    logger.warn("Anthropic cost report sync failed", {
      status: res.status,
      statusText: res.statusText,
    });
    return {
      provider: "anthropic",
      imported: 0,
      skipped: true,
      reason: `HTTP ${res.status}`,
    };
  }

  const payload = (await res.json()) as Record<string, unknown>;
  const buckets =
    (payload["data"] as unknown[]) ??
    (payload["buckets"] as unknown[]) ??
    (payload["results"] as unknown[]) ??
    [];

  let imported = 0;
  for (const item of buckets) {
    const row = asObject(item);
    const amount =
      pickNumber(row, ["amount_usd", "cost_usd", "total_usd", "amount"]) ??
      pickNumber(asObject(row["cost"]), ["usd", "amount_usd"]);
    if (amount == null || amount < 0) continue;

    const occurredAt =
      (row["ending_at"] as string) ||
      (row["bucket_end"] as string) ||
      (row["date"] as string) ||
      window.to.toISOString();
    const service = (row["service"] as string) || "messages";
    const externalId =
      (row["id"] as string) ||
      hashExternalId("anthropic-report", `${service}:${occurredAt}:${JSON.stringify(row)}`);

    await recordPlatformCostEvent({
      provider: "anthropic",
      service,
      category: "inference",
      externalId,
      occurredAt,
      quantity: pickNumber(row, ["total_tokens", "tokens", "usage"]) ?? 1,
      unit: "tokens",
      amountUsd: amount,
      status: "invoiced",
      metadata: row,
    });
    imported += 1;
  }

  return { provider: "anthropic", imported, skipped: false };
}

export async function syncStripeFees(window: SyncWindow): Promise<ProviderSyncResult> {
  if (!env.stripeSecretKey) {
    return {
      provider: "stripe",
      imported: 0,
      skipped: true,
      reason: "STRIPE_SECRET_KEY missing",
    };
  }

  try {
    const stripe = getStripe();
    const start = Math.floor(window.from.getTime() / 1000);
    const end = Math.floor(window.to.getTime() / 1000);
    let startingAfter: string | undefined;
    let imported = 0;

    for (;;) {
      const page = await stripe.balanceTransactions.list({
        created: { gte: start, lte: end },
        limit: 100,
        starting_after: startingAfter,
      });

      for (const tx of page.data) {
        const feeUsd = (tx.fee ?? 0) / 100;
        if (!Number.isFinite(feeUsd) || feeUsd <= 0) continue;

        await recordPlatformCostEvent({
          provider: "stripe",
          service: tx.type ?? "balance_transaction",
          category: "billing",
          externalId: tx.id,
          occurredAt: new Date(tx.created * 1000).toISOString(),
          quantity: 1,
          unit: "transaction",
          amountUsd: Number(feeUsd.toFixed(8)),
          status: "invoiced",
          metadata: {
            type: tx.type,
            description: tx.description ?? null,
            reporting_category: tx.reporting_category ?? null,
            net: tx.net,
            fee: tx.fee,
            currency: tx.currency,
          },
        });
        imported += 1;
      }

      if (!page.has_more || page.data.length === 0) break;
      startingAfter = page.data[page.data.length - 1]?.id;
      if (!startingAfter) break;
    }

    return { provider: "stripe", imported, skipped: false };
  } catch (err) {
    logger.warn("Stripe fee sync failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      provider: "stripe",
      imported: 0,
      skipped: true,
      reason: "Stripe fee sync failed",
    };
  }
}

/**
 * Pull WhatsApp Cloud API spend from the Graph API. Tries `pricing_analytics`
 * first (returns USD cost directly when Meta exposes it for the WABA), then
 * falls back to `conversation_analytics` × the per-category USD rates from
 * env. If credentials are missing the route returns skipped — the Super Admin
 * can still record spend via the manual entry route.
 */
export async function syncMetaWhatsAppCosts(window: SyncWindow): Promise<ProviderSyncResult> {
  if (!env.metaWabaId || !env.metaGraphAccessToken) {
    const missing: string[] = [];
    if (!env.metaWabaId) missing.push("META_WHATSAPP_BUSINESS_ACCOUNT_ID");
    if (!env.metaGraphAccessToken) missing.push("META_GRAPH_ACCESS_TOKEN");
    return {
      provider: "meta",
      imported: 0,
      skipped: true,
      reason: `${missing.join(", ")} missing — use manual entry`,
    };
  }

  const start = Math.floor(window.from.getTime() / 1000);
  const end = Math.floor(window.to.getTime() / 1000);
  const base = `https://graph.facebook.com/${env.metaGraphApiVersion}/${env.metaWabaId}`;
  const headers = {
    Authorization: `Bearer ${env.metaGraphAccessToken}`,
    Accept: "application/json",
  } as const;

  const pricingFields = `pricing_analytics.start(${start}).end(${end}).granularity(DAILY)`;
  const pricingUrl = `${base}?fields=${encodeURIComponent(pricingFields)}`;

  try {
    const pricingRes = await fetch(pricingUrl, { headers, cache: "no-store" });
    if (pricingRes.ok) {
      const payload = (await pricingRes.json()) as Record<string, unknown>;
      const pricing = asObject(payload["pricing_analytics"]);
      const dataPoints = (pricing["data_points"] as unknown[]) ?? [];
      let imported = 0;
      for (const point of dataPoints) {
        const row = asObject(point);
        const amount =
          pickNumber(row, ["cost", "cost_usd", "amount", "amount_usd"]) ??
          pickNumber(asObject(row["pricing"]), ["cost", "cost_usd"]);
        if (amount == null || amount < 0) continue;

        const startTs = pickNumber(row, ["start", "start_time", "timestamp"]) ?? Math.floor(start);
        const occurredAt = new Date(Math.floor(startTs) * 1000).toISOString();
        const category = String(row["pricing_category"] ?? row["category"] ?? "unknown");
        const country = String(row["country"] ?? "global");

        await recordPlatformCostEvent({
          provider: "meta",
          service: "whatsapp",
          category: "messaging",
          externalId: hashExternalId("meta-pricing", `${category}:${country}:${occurredAt}`),
          occurredAt,
          quantity: pickNumber(row, ["volume", "quantity", "conversation"]) ?? 1,
          unit: "conversations",
          amountUsd: amount,
          status: "invoiced",
          metadata: { source: "graph.pricing_analytics", category, country, raw: row },
        });
        imported += 1;
      }
      if (imported > 0) {
        return { provider: "meta", imported, skipped: false };
      }
    } else {
      logger.warn("Meta pricing_analytics unavailable, falling back", {
        status: pricingRes.status,
      });
    }
  } catch (err) {
    logger.warn("Meta pricing_analytics fetch failed, falling back", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const convoFields =
    `conversation_analytics.start(${start}).end(${end}).granularity(DAILY)` +
    `.dimensions(["CONVERSATION_CATEGORY"])`;
  const convoUrl = `${base}?fields=${encodeURIComponent(convoFields)}`;

  const res = await fetch(convoUrl, { headers, cache: "no-store" });
  if (!res.ok) {
    logger.warn("Meta conversation_analytics sync failed", {
      status: res.status,
      statusText: res.statusText,
    });
    return {
      provider: "meta",
      imported: 0,
      skipped: true,
      reason: `HTTP ${res.status} — use manual entry`,
    };
  }

  const payload = (await res.json()) as Record<string, unknown>;
  const analytics = asObject(payload["conversation_analytics"]);
  const dataPoints =
    (analytics["data_points"] as unknown[]) ?? (analytics["data"] as unknown[]) ?? [];
  const rates = env.metaWhatsappUsdPerConversation;
  let imported = 0;

  for (const point of dataPoints) {
    const row = asObject(point);
    const conversation = pickNumber(row, ["conversation", "conversations", "count"]) ?? 0;
    if (conversation <= 0) continue;

    const rawCategory = String(
      row["conversation_category"] ?? row["category"] ?? "service",
    ).toLowerCase();
    const category = (
      rawCategory.includes("market")
        ? "marketing"
        : rawCategory.includes("util")
          ? "utility"
          : rawCategory.includes("auth")
            ? "authentication"
            : "service"
    ) as keyof typeof rates;
    const rate = rates[category];
    const amount = Number((conversation * rate).toFixed(8));

    const startTs = pickNumber(row, ["start", "start_time", "timestamp"]) ?? Math.floor(start);
    const occurredAt = new Date(Math.floor(startTs) * 1000).toISOString();

    await recordPlatformCostEvent({
      provider: "meta",
      service: "whatsapp",
      category: "messaging",
      externalId: hashExternalId("meta-convo", `${category}:${occurredAt}`),
      occurredAt,
      quantity: conversation,
      unit: "conversations",
      amountUsd: amount,
      status: "estimated",
      metadata: {
        source: "graph.conversation_analytics",
        conversation_category: category,
        usd_per_conversation: rate,
        raw: row,
      },
    });
    imported += 1;
  }

  return { provider: "meta", imported, skipped: false };
}

export async function syncUpstashUsage(_window: SyncWindow): Promise<ProviderSyncResult> {
  return {
    provider: "upstash",
    imported: 0,
    skipped: true,
    reason: "Upstash billing sync pending (no provider connector yet)",
  };
}

export async function syncResendUsage(_window: SyncWindow): Promise<ProviderSyncResult> {
  return {
    provider: "resend",
    imported: 0,
    skipped: true,
    reason: "Resend billing sync pending (no provider connector yet)",
  };
}

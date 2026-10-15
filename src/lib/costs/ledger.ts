import { randomUUID } from "node:crypto";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

export type CostProvider =
  | "anthropic"
  | "vercel"
  | "supabase"
  | "upstash"
  | "resend"
  | "stripe"
  | "meta"
  /** Customer-attributable billable units (usage meters, invoicing reconciliation). */
  | "tigerhire";

export type CostStatus = "estimated" | "invoiced" | "manual";

/** Providers allowed for super-admin manual USD rows (Meta = WhatsApp Cloud API spend). */
export type ManualCostProvider = "vercel" | "supabase" | "anthropic" | "meta";

export interface PlatformCostEventInput {
  provider: CostProvider;
  service: string;
  category?: string;
  externalId?: string;
  organisationId?: string;
  /** Job this spend is attributable to (enables per-job rollups). */
  jobId?: string;
  /** Candidate this spend is attributable to. */
  candidateId?: string;
  occurredAt?: string;
  quantity?: number;
  unit?: string;
  amountUsd: number;
  currency?: string;
  status?: CostStatus;
  metadata?: Record<string, unknown>;
  /** Auth user id that recorded the row (manual entries only). */
  enteredBy?: string;
  /** Free-text note (e.g. invoice reference). */
  note?: string;
}

/**
 * Anthropic published pricing (USD per 1k tokens) — kept aligned with
 * https://www.anthropic.com/pricing. Match is by longest model-id prefix so
 * dated checkpoints (e.g. `claude-sonnet-4-20250514`) resolve to the right
 * family. When Anthropic changes pricing, update this table.
 *
 * Cache-aware components (auto-derived from input rate when not specified):
 *   cache_creation_input_tokens → input × 1.25  (5-min cache write)
 *   cache_read_input_tokens     → input × 0.10  (cache hit)
 */
export interface AnthropicRates {
  input: number;
  output: number;
  cacheWrite?: number;
  cacheRead?: number;
}

const ANTHROPIC_RATE_TABLE: ReadonlyArray<{ prefix: string; rates: AnthropicRates }> = [
  { prefix: "claude-opus-4-1", rates: { input: 0.015, output: 0.075 } },
  { prefix: "claude-opus-4", rates: { input: 0.015, output: 0.075 } },
  { prefix: "claude-3-opus", rates: { input: 0.015, output: 0.075 } },
  { prefix: "claude-sonnet-4-5", rates: { input: 0.003, output: 0.015 } },
  { prefix: "claude-sonnet-4", rates: { input: 0.003, output: 0.015 } },
  { prefix: "claude-3-7-sonnet", rates: { input: 0.003, output: 0.015 } },
  { prefix: "claude-3-5-sonnet", rates: { input: 0.003, output: 0.015 } },
  { prefix: "claude-haiku-4-5", rates: { input: 0.001, output: 0.005 } },
  { prefix: "claude-3-5-haiku", rates: { input: 0.0008, output: 0.004 } },
  { prefix: "claude-3-haiku", rates: { input: 0.00025, output: 0.00125 } },
];

const ANTHROPIC_DEFAULT_RATES: AnthropicRates = {
  input: 0.003,
  output: 0.015,
};

export function getAnthropicRate(model: string): Required<AnthropicRates> {
  const key = (model ?? "").toLowerCase();
  let best: AnthropicRates | null = null;
  let bestLen = -1;
  for (const entry of ANTHROPIC_RATE_TABLE) {
    if (key.startsWith(entry.prefix) && entry.prefix.length > bestLen) {
      best = entry.rates;
      bestLen = entry.prefix.length;
    }
  }
  const rates = best ?? ANTHROPIC_DEFAULT_RATES;
  return {
    input: rates.input,
    output: rates.output,
    cacheWrite: rates.cacheWrite ?? rates.input * 1.25,
    cacheRead: rates.cacheRead ?? rates.input * 0.1,
  };
}

export interface AnthropicUsageForCost {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

/**
 * Compute the USD cost for one Anthropic API call. Accepts either positional
 * `(model, inputTokens, outputTokens)` for back-compat or a usage object that
 * also includes cache token components (preferred).
 */
export function calculateAnthropicUsdCost(
  model: string,
  inputTokensOrUsage: number | AnthropicUsageForCost,
  outputTokens?: number,
): number {
  const usage: AnthropicUsageForCost =
    typeof inputTokensOrUsage === "number"
      ? { inputTokens: inputTokensOrUsage, outputTokens: outputTokens ?? 0 }
      : inputTokensOrUsage;
  const rate = getAnthropicRate(model);
  const usd =
    (usage.inputTokens / 1000) * rate.input +
    (usage.outputTokens / 1000) * rate.output +
    ((usage.cacheCreationInputTokens ?? 0) / 1000) * rate.cacheWrite +
    ((usage.cacheReadInputTokens ?? 0) / 1000) * rate.cacheRead;
  return Number(usd.toFixed(8));
}

/** Stable JSON for logs (Postgrest errors stringify as `[object Object]` otherwise). */
export function serializeUnknownForLog(value: unknown): string {
  if (value instanceof Error) {
    return JSON.stringify({
      name: value.name,
      message: value.message,
      stack: value.stack?.slice(0, 2500),
    });
  }
  if (value !== null && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return Object.prototype.toString.call(value);
    }
  }
  return String(value);
}

const OBJECT_OBJECT = "[object Object]";

/**
 * Reject malformed runtime values so platform_cost_events.external_id stays unique and queryable
 * (acceptance test E — never persist `[object Object]`).
 */
export function coercePlatformCostExternalId(explicit: unknown, fallback: string): string {
  if (typeof explicit !== "string") return fallback;
  const t = explicit.trim();
  if (!t || t === OBJECT_OBJECT || t.includes(OBJECT_OBJECT) || t.length > 900) {
    return fallback;
  }
  return t;
}

function slugifyAnthropicModelSegment(model: string): string {
  return (model ?? "unknown")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 180);
}

function coerceAnthropicInvocationId(raw: string): string {
  const t = raw.trim();
  if (!t || t === OBJECT_OBJECT || t.includes(OBJECT_OBJECT)) {
    return randomUUID();
  }
  return t.slice(0, 220);
}

export async function recordPlatformCostEvent(
  input: PlatformCostEventInput,
): Promise<{ externalId: string; error: unknown | null }> {
  const admin = createSupabaseAdmin();
  const fallbackId = `${input.provider}:${randomUUID()}`;
  const externalId = coercePlatformCostExternalId(input.externalId, fallbackId);
  const row = {
    provider: input.provider,
    service: input.service,
    category: input.category ?? "inference",
    external_id: externalId,
    organisation_id: input.organisationId ?? null,
    job_id: input.jobId ?? null,
    candidate_id: input.candidateId ?? null,
    occurred_at: input.occurredAt ?? new Date().toISOString(),
    quantity: input.quantity ?? 1,
    unit: input.unit ?? "unit",
    amount_usd: Number(Math.max(input.amountUsd, 0).toFixed(8)),
    currency: input.currency ?? "USD",
    status: input.status ?? "estimated",
    metadata: input.metadata ?? {},
    entered_by: input.enteredBy ?? null,
    note: input.note ?? null,
  };

  const { error } = await admin.from("platform_cost_events").upsert(row, {
    onConflict: "provider,external_id",
    ignoreDuplicates: false,
  });

  if (error) {
    logger.error("Failed to upsert platform_cost_events", {
      provider: input.provider,
      service: input.service,
      externalId,
      errorSerialized: serializeUnknownForLog(error),
    });
    return { externalId, error };
  }

  return { externalId, error: null };
}

function slugifyManualPeriodKey(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9:_\-]/g, "")
    .slice(0, 120);
  return s;
}

/**
 * Idempotent manual USD line item for a billing period (upserts on provider + external_id).
 * Use when provider billing APIs are unavailable or for reconciliation (e.g. Meta WhatsApp invoice).
 */
export async function recordManualPlatformCost(params: {
  provider: ManualCostProvider;
  amountUsd: number;
  periodKey: string;
  occurredAt?: string;
  notes?: string;
  service?: string;
  enteredByUserId?: string;
}): Promise<{ externalId: string }> {
  const slug = slugifyManualPeriodKey(params.periodKey);
  if (!slug) {
    throw new Error("periodKey must contain at least one letter or number");
  }

  const externalId = `manual:${params.provider}:${slug}`;
  const defaultService =
    params.service?.trim() || (params.provider === "meta" ? "whatsapp" : "manual_entry");

  const category =
    params.provider === "meta"
      ? "messaging"
      : params.provider === "anthropic"
        ? "inference"
        : "infrastructure";

  const { error } = await recordPlatformCostEvent({
    provider: params.provider,
    service: defaultService,
    category,
    externalId,
    occurredAt: params.occurredAt,
    quantity: 1,
    unit: "manual_period",
    amountUsd: params.amountUsd,
    currency: "USD",
    status: "manual",
    enteredBy: params.enteredByUserId,
    note: params.notes?.trim() ?? undefined,
    metadata: {
      source: "manual_entry",
      period_key: params.periodKey.trim(),
    },
  });
  if (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" &&
            error !== null &&
            "message" in error &&
            typeof (error as { message?: unknown }).message === "string"
          ? (error as { message: string }).message
          : String(error);
    throw new Error(message);
  }

  return { externalId };
}

export async function recordAnthropicCostEvent(params: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  label?: string;
  organisationId?: string;
  jobId?: string;
  candidateId?: string;
  /** FitScore entry point (upload, api, rescore, script, investigation). */
  scoringSource?: string;
  /** One UUID per Messages API attempt — ties success + error rows to a single invocation. */
  invocationId: string;
  callStatus?: "ok" | "error";
  errorClass?: string;
}): Promise<void> {
  const safeInvocation = coerceAnthropicInvocationId(params.invocationId);
  const modelSlug = slugifyAnthropicModelSegment(params.model);
  const externalId = coercePlatformCostExternalId(
    `anthropic:${modelSlug}:${safeInvocation}`,
    `anthropic:${modelSlug}:${randomUUID()}`,
  );
  const callStatus = params.callStatus ?? "ok";
  const amountUsd = calculateAnthropicUsdCost(params.model, {
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    cacheCreationInputTokens: params.cacheCreationInputTokens ?? 0,
    cacheReadInputTokens: params.cacheReadInputTokens ?? 0,
  });
  const totalTokens =
    params.inputTokens +
    params.outputTokens +
    (params.cacheCreationInputTokens ?? 0) +
    (params.cacheReadInputTokens ?? 0);
  const rate = getAnthropicRate(params.model);
  const { error } = await recordPlatformCostEvent({
    provider: "anthropic",
    service: "messages",
    category: "inference",
    amountUsd,
    quantity: totalTokens > 0 ? totalTokens : 1,
    unit: "tokens",
    externalId,
    organisationId: params.organisationId,
    jobId: params.jobId,
    candidateId: params.candidateId,
    metadata: {
      model: params.model,
      label: params.label ?? null,
      source: params.scoringSource ?? null,
      status: callStatus,
      ...(params.errorClass ? { error_class: params.errorClass } : {}),
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      cache_creation_input_tokens: params.cacheCreationInputTokens ?? 0,
      cache_read_input_tokens: params.cacheReadInputTokens ?? 0,
      rate_input_per_1k: rate.input,
      rate_output_per_1k: rate.output,
      rate_cache_write_per_1k: rate.cacheWrite,
      rate_cache_read_per_1k: rate.cacheRead,
    },
  });
  if (error) {
    logger.error("recordAnthropicCostEvent: platform_cost_events upsert failed", {
      externalId,
      label: params.label,
      errorSerialized: serializeUnknownForLog(error),
    });
  }
}

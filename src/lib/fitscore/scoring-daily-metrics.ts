/**
 * Daily FitScore cost summary from platform_cost_events + fit_scores.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { sendOpsAlert } from "@/lib/observability/alerts";
import { isVisionFallbackEnabled } from "@/lib/fitscore/score-input-helpers";
import { getFitscoreHybridModel } from "@/lib/config/models";
import type { FitScoreObservabilityEventType } from "./scoring-observability";

const FITSCORE_ANTHROPIC_LABELS = new Set([
  "fitscore-hybrid-extraction-verdict",
  "fitscore-hybrid-extraction",
  "fitscore-hybrid-explanation",
  "fitscore-hybrid-verdict-explanation",
  "vision-fallback-resume",
]);

const OBSERVABILITY_TYPES: FitScoreObservabilityEventType[] = [
  "fitscore_dedupe_skip",
  "fitscore_concurrent_skip",
  "fitscore_extraction_retry",
  "vision_fallback_skipped",
];

export type FitScoreDailySummary = {
  type: "fitscore_daily_summary";
  date: string;
  candidates_scored: number;
  total_claude_calls: number;
  calls_per_score: number;
  dedupe_skips: number;
  concurrent_skips: number;
  retry_count: number;
  retry_rate_pct: number;
  vision_fallback_triggered: number;
  vision_fallback_skipped: number;
  cache_hit_rate_pct: number;
  sonnet_calls: number;
  haiku_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  cost_per_score_usd: number;
  cost_per_score_inr: number;
  sonnet_cost_share_pct?: number;
  alerts?: string[];
};

export type ScoringDailyMetricsRow = {
  date: string;
  candidates_scored: number;
  total_claude_calls: number;
  calls_per_score: number;
  dedupe_skips: number;
  concurrent_skips: number;
  retry_count: number;
  vision_fallback_triggered: number;
  vision_fallback_skipped: number;
  cache_hit_rate_pct: number;
  total_cost_usd: number;
  cost_per_score_usd: number;
};

function dayBoundsUtc(dateStr: string): { start: string; end: string } {
  return { start: `${dateStr}T00:00:00.000Z`, end: `${dateStr}T23:59:59.999Z` };
}

function usdToInr(usd: number): number {
  const rate = Number(process.env.FITSCORE_USD_TO_INR_RATE ?? "95");
  return Number((usd * rate).toFixed(2));
}

function isSonnetModel(model: string): boolean {
  return model.toLowerCase().includes("sonnet");
}

function isHaikuModel(model: string): boolean {
  return model.toLowerCase().includes("haiku");
}

type CostMeta = {
  model?: string;
  label?: string | null;
  type?: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
};

function evaluateAlerts(
  summary: FitScoreDailySummary,
  observabilityCounts?: { fitscore_deterministic_fallback?: number },
): string[] {
  const alerts: string[] = [];
  if (summary.calls_per_score > 2.5) {
    alerts.push(`calls_per_score ${summary.calls_per_score} > 2.5`);
  }
  if (summary.cache_hit_rate_pct < 50) {
    alerts.push(`cache_hit_rate_pct ${summary.cache_hit_rate_pct} < 50`);
  }
  const deterministicFallbacks = observabilityCounts?.fitscore_deterministic_fallback ?? 0;
  if (summary.candidates_scored > 0) {
    const fallbackRate = (deterministicFallbacks / summary.candidates_scored) * 100;
    if (fallbackRate >= 10) {
      alerts.push(
        `fitscore_deterministic_fallback ${deterministicFallbacks} (${fallbackRate.toFixed(1)}% of scored candidates) >= 10%`,
      );
    }
  }
  if (!isVisionFallbackEnabled() && summary.vision_fallback_triggered > 0) {
    alerts.push(
      `vision_fallback_triggered ${summary.vision_fallback_triggered} while FF_VISION_FALLBACK_ENABLED=false`,
    );
  }
  if (summary.cost_per_score_usd > 0.05) {
    alerts.push(`cost_per_score_usd ${summary.cost_per_score_usd} > 0.05`);
  }
  const hybridModel = getFitscoreHybridModel().toLowerCase();
  if (hybridModel.includes("sonnet") && summary.haiku_calls > 0 && summary.total_claude_calls > 0) {
    const haikuShare = (summary.haiku_calls / summary.total_claude_calls) * 100;
    if (haikuShare >= 15) {
      alerts.push(
        `haiku_calls ${summary.haiku_calls} (${haikuShare.toFixed(1)}% of calls) while FITSCORE_HYBRID_MODEL is Sonnet`,
      );
    }
  }
  if (hybridModel.includes("haiku") && summary.sonnet_calls > 0 && summary.total_claude_calls > 0) {
    const sonnetCallShare = (summary.sonnet_calls / summary.total_claude_calls) * 100;
    if (sonnetCallShare >= 15) {
      alerts.push(
        `sonnet_calls ${summary.sonnet_calls} (${sonnetCallShare.toFixed(1)}% of calls) while FITSCORE_HYBRID_MODEL is Haiku`,
      );
    }
  }
  return alerts;
}

export async function buildFitScoreDailySummary(
  supabase: SupabaseClient,
  dateStr: string,
): Promise<FitScoreDailySummary> {
  const { start, end } = dayBoundsUtc(dateStr);

  const { count: candidatesScored, error: fsErr } = await supabase
    .from("fit_scores")
    .select("id", { count: "exact", head: true })
    .eq("scoring_status", "scored")
    .eq("is_test_run", false)
    .gte("created_at", start)
    .lte("created_at", end);
  if (fsErr) throw fsErr;

  const { data: anthropicRows, error: aErr } = await supabase
    .from("platform_cost_events")
    .select("amount_usd, metadata")
    .eq("provider", "anthropic")
    .gte("occurred_at", start)
    .lte("occurred_at", end);
  if (aErr) throw aErr;

  const { data: obsRows, error: oErr } = await supabase
    .from("platform_cost_events")
    .select("metadata")
    .eq("provider", "tigerhire")
    .eq("service", "fitscore_scoring")
    .gte("occurred_at", start)
    .lte("occurred_at", end);
  if (oErr) throw oErr;

  let totalClaudeCalls = 0;
  let sonnetCalls = 0;
  let haikuCalls = 0;
  let sonnetCost = 0;
  let totalCost = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let sonnetInput = 0;
  let sonnetCacheRead = 0;
  let visionTriggered = 0;

  for (const row of anthropicRows ?? []) {
    const m = row.metadata as CostMeta;
    const label = m.label ?? "";
    if (!FITSCORE_ANTHROPIC_LABELS.has(label)) continue;

    totalClaudeCalls += 1;
    const amt = Number(row.amount_usd);
    totalCost += amt;
    inputTokens += m.input_tokens ?? 0;
    outputTokens += m.output_tokens ?? 0;

    const model = m.model ?? "";
    if (isSonnetModel(model)) {
      sonnetCalls += 1;
      sonnetCost += amt;
      sonnetInput += m.input_tokens ?? 0;
      sonnetCacheRead += m.cache_read_input_tokens ?? 0;
    }
    if (isHaikuModel(model)) haikuCalls += 1;
    if (label === "vision-fallback-resume") visionTriggered += 1;
  }

  const obsCounts: Record<FitScoreObservabilityEventType, number> = {
    fitscore_dedupe_skip: 0,
    fitscore_concurrent_skip: 0,
    fitscore_extraction_retry: 0,
    fitscore_extraction_validation_failed: 0,
    fitscore_deterministic_fallback: 0,
    fitscore_empty_dimension_scores: 0,
    resume_processing_tier: 0,
    vision_fallback_skipped: 0,
  };
  for (const row of obsRows ?? []) {
    const t = (row.metadata as CostMeta)?.type as FitScoreObservabilityEventType | undefined;
    if (t && t in obsCounts) obsCounts[t] += 1;
  }

  const nCandidates = candidatesScored ?? 0;
  const callsPerScore = nCandidates > 0 ? Number((totalClaudeCalls / nCandidates).toFixed(1)) : 0;
  const costPerScore = nCandidates > 0 ? Number((totalCost / nCandidates).toFixed(4)) : 0;
  const cacheHitRate =
    sonnetCacheRead + sonnetInput > 0
      ? Number(((sonnetCacheRead / (sonnetCacheRead + sonnetInput)) * 100).toFixed(1))
      : 0;
  const retryRate =
    totalClaudeCalls > 0
      ? Number(((obsCounts.fitscore_extraction_retry / totalClaudeCalls) * 100).toFixed(1))
      : 0;

  const summary: FitScoreDailySummary = {
    type: "fitscore_daily_summary",
    date: dateStr,
    candidates_scored: nCandidates,
    total_claude_calls: totalClaudeCalls,
    calls_per_score: callsPerScore,
    dedupe_skips: obsCounts.fitscore_dedupe_skip,
    concurrent_skips: obsCounts.fitscore_concurrent_skip,
    retry_count: obsCounts.fitscore_extraction_retry,
    retry_rate_pct: retryRate,
    vision_fallback_triggered: visionTriggered,
    vision_fallback_skipped: obsCounts.vision_fallback_skipped,
    cache_hit_rate_pct: cacheHitRate,
    sonnet_calls: sonnetCalls,
    haiku_calls: haikuCalls,
    total_input_tokens: inputTokens,
    total_output_tokens: outputTokens,
    total_cost_usd: Number(totalCost.toFixed(4)),
    cost_per_score_usd: costPerScore,
    cost_per_score_inr: usdToInr(costPerScore),
    sonnet_cost_share_pct: totalCost > 0 ? Number((sonnetCost / totalCost).toFixed(4)) : 0,
  };

  summary.alerts = evaluateAlerts(summary, obsCounts);
  return summary;
}

export async function persistScoringDailyMetrics(
  supabase: SupabaseClient,
  summary: FitScoreDailySummary,
): Promise<void> {
  const row: ScoringDailyMetricsRow = {
    date: summary.date,
    candidates_scored: summary.candidates_scored,
    total_claude_calls: summary.total_claude_calls,
    calls_per_score: summary.calls_per_score,
    dedupe_skips: summary.dedupe_skips,
    concurrent_skips: summary.concurrent_skips,
    retry_count: summary.retry_count,
    vision_fallback_triggered: summary.vision_fallback_triggered,
    vision_fallback_skipped: summary.vision_fallback_skipped,
    cache_hit_rate_pct: summary.cache_hit_rate_pct,
    total_cost_usd: summary.total_cost_usd,
    cost_per_score_usd: summary.cost_per_score_usd,
  };

  const { error } = await supabase.from("scoring_daily_metrics").upsert(
    {
      ...row,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "date" },
  );
  if (error) throw error;
}

export function logFitScoreDailySummary(summary: FitScoreDailySummary): void {
  console.log(JSON.stringify(summary, null, 2));
  logger.info(JSON.stringify(summary));
  if (summary.alerts?.length) {
    for (const alert of summary.alerts) {
      logger.warn(
        JSON.stringify({
          type: "fitscore_daily_summary_alert",
          date: summary.date,
          alert,
        }),
      );
    }
    const text = [
      `FitScore daily metrics alerts (${summary.date})`,
      ...summary.alerts.map((a) => `• ${a}`),
    ].join("\n");
    void sendOpsAlert(text);
  }
}

/** Build summary for `dateStr` (YYYY-MM-DD UTC), persist, log, return. */
export async function runFitScoreDailyMetricsJob(dateStr?: string): Promise<FitScoreDailySummary> {
  const date = dateStr ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const admin = createSupabaseAdmin();
  const summary = await buildFitScoreDailySummary(admin, date);
  await persistScoringDailyMetrics(admin, summary);
  logFitScoreDailySummary(summary);
  return summary;
}

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";

type CostEventRow = {
  metadata: Record<string, unknown> | null;
};

function numberOrZero(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function hasEvidenceFallback(evidenceJson: unknown): boolean {
  if (!evidenceJson || typeof evidenceJson !== "object") return true;
  const quotes = (evidenceJson as { quotes?: unknown }).quotes;
  if (!Array.isArray(quotes) || quotes.length === 0) return true;
  return quotes.some((entry) => {
    if (!entry || typeof entry !== "object") return true;
    const quote = String((entry as { quote?: unknown }).quote ?? "").trim();
    return !quote || quote === "NO_DEFENSIBLE_QUOTE";
  });
}

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const admin = createSupabaseAdmin();
    const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [costEventsRes, batchEventsRes, fitScoresRes] = await Promise.all([
      admin
        .from("platform_cost_events")
        .select("metadata")
        .eq("provider", "anthropic")
        .gte("occurred_at", sinceIso)
        .limit(5000),
      admin
        .from("platform_cost_events")
        .select("metadata")
        .eq("provider", "anthropic")
        .eq("service", "fitscore_batch")
        .gte("occurred_at", sinceIso)
        .limit(2000),
      admin
        .from("fit_scores")
        .select("confidence, evidence_json")
        .eq("scoring_version", 2)
        .eq("scoring_status", "scored")
        .or("is_test_run.eq.false,is_test_run.is.null")
        .is("superseded_at", null)
        .gte("created_at", sinceIso)
        .limit(5000),
    ]);

    if (costEventsRes.error) throw costEventsRes.error;
    if (batchEventsRes.error) throw batchEventsRes.error;
    if (fitScoresRes.error) throw fitScoresRes.error;

    const costRows = (costEventsRes.data ?? []) as CostEventRow[];
    let cacheReadTokens = 0;
    let cacheCreationTokens = 0;
    let inputTokens = 0;
    for (const row of costRows) {
      const meta = row.metadata ?? {};
      cacheReadTokens += numberOrZero(meta.cache_read_input_tokens);
      cacheCreationTokens += numberOrZero(meta.cache_creation_input_tokens);
      inputTokens += numberOrZero(meta.input_tokens);
    }
    const cacheDenominator = inputTokens + cacheReadTokens + cacheCreationTokens;
    const cacheHitRatePct =
      cacheDenominator > 0 ? Number(((cacheReadTokens / cacheDenominator) * 100).toFixed(2)) : 0;

    const batchRows = (batchEventsRes.data ?? []) as CostEventRow[];
    let batchHighWaterMark = 0;
    let latestBatchLimit = 0;
    for (const row of batchRows) {
      const meta = row.metadata ?? {};
      batchHighWaterMark = Math.max(
        batchHighWaterMark,
        numberOrZero(meta.batch_concurrency_high_water_mark),
      );
      latestBatchLimit = Math.max(latestBatchLimit, numberOrZero(meta.batch_concurrency_limit));
    }

    const fitRows = (fitScoresRes.data ?? []) as Array<{
      confidence: string | null;
      evidence_json: unknown;
    }>;
    const evidenceTotal = fitRows.length;
    const evidencePassed = fitRows.filter((row) => !hasEvidenceFallback(row.evidence_json)).length;
    const evidencePassRatePct =
      evidenceTotal > 0 ? Number(((evidencePassed / evidenceTotal) * 100).toFixed(2)) : 0;

    const confidenceDistribution = {
      high: fitRows.filter((row) => row.confidence === "high").length,
      medium: fitRows.filter((row) => row.confidence === "medium").length,
      low: fitRows.filter((row) => row.confidence === "low").length,
      unknown: fitRows.filter((row) => !row.confidence).length,
    };

    return jsonSuccess({
      window: { since: sinceIso, hours: 24 },
      metrics: {
        cacheHitRatePct,
        cacheReadTokens,
        cacheCreationTokens,
        inputTokens,
        batchConcurrencyHighWaterMark: batchHighWaterMark,
        batchConcurrencyConfiguredLimit: latestBatchLimit,
        evidenceQuoteValidationPassRatePct: evidencePassRatePct,
        confidenceBandDistribution: confidenceDistribution,
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch FitScore observability metrics", {
      route: "GET /api/admin/fitscore-observability",
    });
  }
}

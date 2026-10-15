/**
 * Persist hybrid v2 results to fit_scores (admin client).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { dedupeFlags, flagsAreNearDuplicate } from "@/lib/fitscore/dedupe-flags";
import type { HybridJdBaseRubricSnapshot } from "./rubric-snapshot";
import type {
  CandidateExtraction,
  HybridConfidence,
  HybridEvidenceJson,
  ScoreBreakdown,
} from "./types";

/**
 * Ideal-profile gaps minus anything that duplicates a red flag. The model often restates a
 * red flag as an ideal gap and the UI merges both lists into one "gaps" section.
 *
 * Index-based (not string-equality-based) on purpose: when an ideal gap is the EXACT same
 * string as a red flag, a naive "keep deduped items that string-match an original ideal gap"
 * filter re-admits the duplicate via the kept red-flag instance. Here an item only survives
 * if the kept occurrence itself came from the ideal-gaps range.
 */
export function idealGapsExcludingRedFlagDupes(
  redFlagTexts: ReadonlyArray<string>,
  idealGaps: ReadonlyArray<string>,
  limit = 40,
): string[] {
  const combined = [...redFlagTexts, ...idealGaps];
  const kept: string[] = [];
  const out: string[] = [];
  for (let i = 0; i < combined.length; i++) {
    const cand = combined[i]?.trim();
    if (!cand) continue;
    if (kept.some((k) => flagsAreNearDuplicate(cand, k))) continue;
    kept.push(cand);
    if (i >= redFlagTexts.length) out.push(cand);
    if (kept.length >= limit) break;
  }
  return out;
}

export async function saveHybridFitScore(
  supabase: SupabaseClient,
  payload: {
    job_id: string;
    candidate_id: string;
    overall_score: number;
    band: string;
    extraction: CandidateExtraction;
    explanation: string;
    evidence: HybridEvidenceJson;
    breakdown: ScoreBreakdown;
    confidence: HybridConfidence;
    is_test_run?: boolean;
    ideal_match_pct?: number;
    ideal_gaps?: string[];
    market_percentile?: number | null;
    market_pool_size?: number;
    market_label?: string;
    verdict?: string;
    verdict_action?: string;
    shadow_score?: number;
    shadow_blend?: Record<string, unknown>;
    primary_score?: number | null;
    primary_blend?: Record<string, unknown> | null;
    signals_log?: Record<string, unknown>;
    scoring_method?: string;
    model_used?: string | null;
    scoring_tier?: string | null;
    jd_base_document_id: string;
    jd_base_version: number;
    rubric_snapshot: HybridJdBaseRubricSnapshot;
  },
): Promise<void> {
  const isTestRun = payload.is_test_run ?? false;
  const nowIso = new Date().toISOString();
  const row: Record<string, unknown> = {
    job_id: payload.job_id,
    candidate_id: payload.candidate_id,
    overall_score: payload.overall_score,
    band: payload.band,
    scoring_version: 2,
    v2_extraction: payload.extraction as unknown as Record<string, unknown>,
    v2_explanation: payload.explanation,
    evidence_json: payload.evidence as unknown as Record<string, unknown>,
    v2_score_breakdown: {
      ...(payload.breakdown as unknown as Record<string, unknown>),
      confidence_score: payload.confidence.score,
      ...(payload.signals_log ? { signals_log: payload.signals_log } : {}),
    },
    summary: payload.extraction.summary?.slice(0, 2000) ?? "",
    one_line_summary: payload.explanation.split(/\n+/).filter(Boolean).slice(0, 1).join(" ") || "",
    green_flags: dedupeFlags(payload.extraction.green_flags ?? [], 20),
    red_flags: dedupeFlags(
      (payload.extraction.red_flags ?? []).map((r) => r.flag),
      20,
    ),
    // Verify-with-candidate watch-items from the merged verdict. Dedupe against red flags —
    // the UI shows amber and red in separate sections and must not repeat a concern.
    amber_flags: idealGapsExcludingRedFlagDupes(
      (payload.extraction.red_flags ?? []).map((r) => r.flag),
      payload.evidence.amber_flags ?? [],
      30,
    ),
    confidence: payload.confidence.band,
    is_test_run: isTestRun,
    ideal_match_pct: payload.ideal_match_pct ?? null,
    // Dedupe against red_flags too — the model often restates a red flag as an
    // ideal-profile gap, and the UI merges both lists into one "gaps" section.
    ideal_gaps: payload.ideal_gaps
      ? idealGapsExcludingRedFlagDupes(
          (payload.extraction.red_flags ?? []).map((r) => r.flag),
          payload.ideal_gaps,
          40,
        )
      : null,
    market_percentile: payload.market_percentile ?? null,
    market_pool_size: payload.market_pool_size ?? null,
    market_label: payload.market_label ?? null,
    verdict: payload.verdict ?? null,
    verdict_action: payload.verdict_action ?? null,
    primary_score: payload.primary_score ?? null,
    primary_blend: payload.primary_blend ?? null,
    shadow_score: payload.shadow_score ?? null,
    shadow_blend: payload.shadow_blend ?? null,
    superseded_at: null,
    superseded_by_id: null,
    scoring_status: "scored",
    scoring_status_reason: null,
    scoring_status_updated_at: nowIso,
    scoring_method: payload.scoring_method ?? "hybrid_merged",
    jd_base_document_id: payload.jd_base_document_id,
    jd_base_version: payload.jd_base_version,
    rubric_snapshot: payload.rubric_snapshot as unknown as Record<string, unknown>,
    ...(payload.model_used != null ? { model_used: payload.model_used } : {}),
    ...(payload.scoring_tier != null ? { scoring_tier: payload.scoring_tier } : {}),
  };

  if (isTestRun) {
    const { data: existingScores, error: countError } = await supabase
      .from("fit_scores")
      .select("run_index")
      .eq("job_id", payload.job_id)
      .eq("candidate_id", payload.candidate_id)
      .order("run_index", { ascending: false })
      .limit(1);
    if (countError) throw countError;
    const maxRunIndex = existingScores?.[0]?.run_index ?? 0;
    row.run_index = maxRunIndex + 1;
    const { error } = await supabase.from("fit_scores").insert(row);
    if (error) throw new Error(`Failed to save FitScore: ${error.message}`);
    return;
  }

  row.run_index = 1;
  row.is_test_run = false;

  const { data: latestProduction } = await supabase
    .from("fit_scores")
    .select("id, run_index")
    .eq("job_id", payload.job_id)
    .eq("candidate_id", payload.candidate_id)
    .eq("is_test_run", false)
    .is("superseded_at", null)
    .order("run_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  // run_index is unique for a (job_id, candidate_id) pair across test + production rows.
  // Use the global max run_index to avoid collisions when test runs already consumed indices.
  const { data: latestAnyRun } = await supabase
    .from("fit_scores")
    .select("run_index")
    .eq("job_id", payload.job_id)
    .eq("candidate_id", payload.candidate_id)
    .order("run_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextRunIndex = Number(latestAnyRun?.run_index ?? 0) + 1;
  row.run_index = nextRunIndex;

  // Supersede current active row first to satisfy active-row uniqueness constraint.
  if (latestProduction?.id) {
    const { error: supersedeErr } = await supabase
      .from("fit_scores")
      .update({
        superseded_at: nowIso,
        superseded_by_id: null,
      })
      .eq("id", latestProduction.id);
    if (supersedeErr)
      throw new Error(`Failed to supersede existing FitScore: ${supersedeErr.message}`);
  }

  const { data: inserted, error: insertError } = await supabase
    .from("fit_scores")
    .insert(row)
    .select("id")
    .single();
  if (insertError) {
    // Best-effort rollback if we superseded active row but failed to insert replacement.
    if (latestProduction?.id) {
      await supabase
        .from("fit_scores")
        .update({
          superseded_at: null,
          superseded_by_id: null,
        })
        .eq("id", latestProduction.id);
    }
    throw new Error(`Failed to save FitScore: ${insertError.message}`);
  }

  if (latestProduction?.id && inserted?.id) {
    const { error: linkErr } = await supabase
      .from("fit_scores")
      .update({
        superseded_by_id: inserted.id,
      })
      .eq("id", latestProduction.id);
    if (linkErr) throw new Error(`Failed to link superseded FitScore row: ${linkErr.message}`);
  }
}

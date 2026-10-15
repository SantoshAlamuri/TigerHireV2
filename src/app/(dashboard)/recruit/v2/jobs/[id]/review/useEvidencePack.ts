"use client";

import { useMemo } from "react";
import { buildEvidencePack, type EvidencePack } from "@/lib/v2/evidence-pack";

/**
 * Adapts an application row into the evidence pack. Kept out of the page so the
 * shape-coercion (the API is loosely typed here) has one home, and the page
 * stays a renderer.
 */
export interface ReviewAppRow {
  id: string;
  candidate_id: string;
  candidates?: {
    name?: string | null;
    location?: string | null;
    experience_years?: number | null;
  } | null;
  notice_period_days?: number | null;
  expected_ctc_lpa?: number | null;
  offers_in_hand?: number | null;
  fit_scores?: {
    overall_score?: number | null;
    scoring_method?: string | null;
    criteria_breakdown?: unknown;
    ideal_match_pct?: number | null;
    market_percentile?: number | null;
    market_label?: string | null;
    green_flags?: (string | null)[] | null;
    amber_flags?: (string | null)[] | null;
    red_flags?: (string | null)[] | null;
    evidence_json?: { quotes?: { quote?: string; location_hint?: string }[] } | null;
  } | null;
  /**
   * The real relation. `prescreen_answers` was read here for weeks and is not a
   * column on applications, so screening answers always resolved to an empty
   * array and the review screen silently showed none.
   */
  application_screening_answers?:
    | { question_id?: string | null; answer_yes?: boolean | null; answer_text?: string | null }[]
    | null;
}

export function useEvidencePack(
  row: ReviewAppRow | undefined,
  rubricMustHaves: string[] = [],
  /** Score fetched by candidate — the row's embedded join is always empty. */
  score?: {
    green_flags?: (string | null)[] | null;
    amber_flags?: (string | null)[] | null;
    red_flags?: (string | null)[] | null;
    evidence_json?: { quotes?: { quote?: string; location_hint?: string }[] } | null;
  },
): EvidencePack {
  return useMemo(
    () =>
      buildEvidencePack({
        // Real stored shape: evidence_json.quotes carries the CV lines with a
        // location hint; the flag tiers are three separate arrays. An earlier
        // version read `reasons` and `flags`, which are not columns at all — so
        // these columns rendered empty every time.
        reasons: (score?.evidence_json?.quotes ?? [])
          .filter((q) => (q.quote ?? "").trim().length > 0)
          .map((q) => ({
            text: String(q.quote),
            polarity: "positive" as const,
            source: "cv" as const,
          })),
        flags: [
          ...(score?.green_flags ?? []).map((f) => ({
            label: String(f ?? ""),
            tier: "green" as const,
          })),
          ...(score?.amber_flags ?? []).map((f) => ({
            label: String(f ?? ""),
            tier: "amber" as const,
          })),
          ...(score?.red_flags ?? []).map((f) => ({
            label: String(f ?? ""),
            tier: "red" as const,
          })),
        ].filter((f) => f.label.trim().length > 0),
        screeningAnswers: (row?.application_screening_answers ?? []).map((a) => ({
          // The question text is fetched separately by the screening panel; the
          // answer row carries only the id, so the id is what is passed on.
          question: String(a.question_id ?? ""),
          answer:
            a.answer_text?.trim() ||
            (a.answer_yes === true ? "Yes" : a.answer_yes === false ? "No" : ""),
        })),
        // A must-have with nothing supporting it becomes a probe for the
        // interview — never an accusation, and never invented.
        rubricMustHaves,
      }),
    [row, rubricMustHaves, score],
  );
}

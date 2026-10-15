"use client";

import { useCallback, useMemo } from "react";
import { scorePanel, type ScorePanelInput } from "@/lib/v2/score-panel";
import type { ReviewAppRow } from "./useEvidencePack";
import type { JobScore } from "./useReviewData";

/**
 * Adapts stored fit_scores rows into the three-score panel and the per-row flag
 * inputs. Kept out of the page so the shape-coercion has one home — every field
 * here is already persisted; none of it is derived or guessed.
 */
export function useScorePanels(
  rows: Map<string, ReviewAppRow>,
  scoresByCandidate: Map<string, JobScore>,
  currentId: string | undefined,
) {
  const panelFor = useCallback(
    (appId: string | undefined): ScorePanelInput => {
      const candidateId = appId ? rows.get(appId)?.candidate_id : undefined;
      const fs = candidateId ? scoresByCandidate.get(candidateId) : undefined;
      return {
        overallScore: fs?.overall_score ?? null,
        idealMatchPct: fs?.ideal_match_pct ?? null,
        marketPercentile: fs?.market_percentile ?? null,
        marketLabel: fs?.market_label ?? null,
        greenFlags: fs?.green_flags ?? null,
        amberFlags: fs?.amber_flags ?? null,
        redFlags: fs?.red_flags ?? null,
      };
    },
    [rows, scoresByCandidate],
  );

  const scores = useMemo(() => scorePanel(panelFor(currentId)), [panelFor, currentId]);
  return { panelFor, scores };
}

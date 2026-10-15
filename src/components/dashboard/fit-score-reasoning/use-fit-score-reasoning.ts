"use client";

import { useMemo } from "react";
import type { FitScoreReasoningPanelProps } from "./types";
import {
  dedupeByNormalized,
  dedupeNearDuplicateFlagLines,
  humanizeDisplayToken,
  insightDuplicatesWhyVerdictBody,
  linesAreNearDuplicateFlagLines,
  shortenWhyVerdictForCustomer,
  whyVerdictIsRedundantWithGaps,
} from "./helpers";
import {
  getEvidenceForCriterion,
  hiddenGemHeuristic,
  marketHeadline,
  normalizedParseQuality01,
} from "./score-helpers";

/**
 * Derives every recruiter-facing value the panel renders from a raw {@link FitScore}.
 * Extracted verbatim from FitScoreReasoningPanel — same memo dependency arrays.
 */
export function useFitScoreReasoning(props: FitScoreReasoningPanelProps) {
  const { score, candidateDisplayName } = props;

  const parseQuality01 = normalizedParseQuality01(score);
  const parseWarning = parseQuality01 !== null && parseQuality01 > 0 && parseQuality01 < 0.7;
  const { value: marketValue, sub: marketSub } = marketHeadline(score);
  const idealDisplay =
    score.idealMatchPct != null && score.idealMatchPct > 0 ? `${score.idealMatchPct}%` : "—";
  const scoreMatchedKeywords = score.matchedKeywords;
  const matchedKeywords = useMemo(() => scoreMatchedKeywords ?? [], [scoreMatchedKeywords]);
  const whyPrimaryRaw =
    score.holisticRationale?.trim() ||
    score.oneLineSummary?.trim() ||
    score.aiSummary?.trim() ||
    "";
  const verdictQuotes = score.verdictEvidenceQuotes ?? [];
  const evidenceByCriterion = useMemo(
    () =>
      (score.criteriaBreakdown ?? []).map((criterion) => ({
        criterion,
        evidence:
          getEvidenceForCriterion(score, criterion.criterion_id, criterion.criterion_name) ??
          criterion.evidence_text ??
          null,
      })),
    [score],
  );
  /**
   * Evidence column: JD keywords when present; otherwise CV quote snippets; otherwise strength
   * highlights. When chips come from the strengths fallback the ✓ list must NOT be deduped
   * against them — that stripped every top strength and rendered "No strengths listed".
   */
  const { evidenceChips, chipsFromStrengthsFallback } = useMemo(() => {
    const keywordChips = dedupeByNormalized(matchedKeywords, 14);
    if (keywordChips.length > 0) {
      return { evidenceChips: keywordChips, chipsFromStrengthsFallback: false };
    }

    const quotes = score.verdictEvidenceQuotes ?? [];
    const quoteLines: string[] = [];
    for (const q of quotes) {
      const qq = q.quote?.trim();
      if (!qq) continue;
      const dim = q.dimension?.trim();
      const line =
        dim && qq.length <= 120 ? `${dim}: ${qq}` : qq.length > 140 ? `${qq.slice(0, 137)}…` : qq;
      quoteLines.push(line);
      if (quoteLines.length >= 10) break;
    }
    const quoteChips = dedupeByNormalized(quoteLines, 10);
    if (quoteChips.length > 0) {
      return { evidenceChips: quoteChips, chipsFromStrengthsFallback: false };
    }

    const merged = dedupeByNormalized(
      [...(score.keyStrengths ?? []), ...(score.greenFlags ?? [])],
      16,
    );
    const strengthFallback = dedupeNearDuplicateFlagLines(merged, 8);
    return { evidenceChips: strengthFallback, chipsFromStrengthsFallback: true };
  }, [matchedKeywords, score.greenFlags, score.keyStrengths, score.verdictEvidenceQuotes]);

  /**
   * Gaps (✗): merge redFlags + keyGaps + idealGaps — `keyGaps ?? redFlags` hid redFlags when
   * keyGaps was []. Red flags go first so the display cap never drops a serious red flag in
   * favour of terse ideal gaps (dedupe keeps first-seen order).
   */
  const gapItems = useMemo(() => {
    const merged = dedupeByNormalized(
      [...(score.redFlags ?? []), ...(score.keyGaps ?? []), ...(score.idealGaps ?? [])],
      32,
    );
    return dedupeNearDuplicateFlagLines(merged, 14);
  }, [score.idealGaps, score.keyGaps, score.redFlags]);
  const whyPrimaryForDisplay = useMemo(() => {
    const raw = shortenWhyVerdictForCustomer(whyPrimaryRaw);
    if (!raw) return null;
    if (whyVerdictIsRedundantWithGaps(raw, gapItems)) return null;
    return raw;
  }, [gapItems, whyPrimaryRaw]);
  const gapKeys = useMemo(() => new Set(gapItems.map((s) => s.toLowerCase())), [gapItems]);

  const amberItems = useMemo(() => {
    const raw = dedupeByNormalized(score.amberFlags ?? [], 16);
    const filtered = raw.filter((s) => !gapKeys.has(s.toLowerCase()));
    return dedupeNearDuplicateFlagLines(filtered, 12);
  }, [gapKeys, score.amberFlags]);
  const amberKeys = useMemo(() => new Set(amberItems.map((s) => s.toLowerCase())), [amberItems]);

  const strengthItems = useMemo(() => {
    const base = dedupeByNormalized(
      [...(score.keyStrengths ?? []), ...(score.greenFlags ?? [])],
      14,
    ).filter((s) => !gapKeys.has(s.toLowerCase()) && !amberKeys.has(s.toLowerCase()));
    let items = dedupeNearDuplicateFlagLines(base, 10);
    // Only dedupe the ✓ list against chips that are real evidence (keywords / CV quotes).
    // When chips ARE the strengths fallback, filtering would strip every strength.
    if (!chipsFromStrengthsFallback) {
      items = items.filter(
        (s) => !evidenceChips.some((chip) => linesAreNearDuplicateFlagLines(s, chip)),
      );
    }
    return items;
  }, [
    amberKeys,
    chipsFromStrengthsFallback,
    evidenceChips,
    gapKeys,
    score.greenFlags,
    score.keyStrengths,
  ]);
  const displayName = (candidateDisplayName ?? score.candidateName)?.trim() || "Candidate";
  const candidateInitial = (displayName[0] ?? "?").toUpperCase();
  const roleLine =
    [score.candidateCurrentRole?.trim() || score.jobTitle?.trim(), score.companyName?.trim()]
      .filter(Boolean)
      .join(" · ") || null;
  const modelName = score.extractionModel ?? score.modelVersion ?? "TigerHire AI";
  const modelFootnote = score.extractionFallback === true ? `${modelName} (fallback)` : modelName;
  const primaryVerdictLabel =
    humanizeDisplayToken(score.verdict) ??
    humanizeDisplayToken(score.band) ??
    humanizeDisplayToken(score.rating);
  /** Short hiring action line (e.g. hybrid “Interview immediately”) — paired with verdict in header. */
  const verdictActionChipRaw = humanizeDisplayToken(score.verdictAction?.trim() || null);
  const verdictActionChip =
    verdictActionChipRaw &&
    (!primaryVerdictLabel ||
      verdictActionChipRaw.trim().toLowerCase() !== primaryVerdictLabel.trim().toLowerCase())
      ? verdictActionChipRaw
      : null;
  /**
   * Amber insight strip: when hiring action is already in the header chip, don’t repeat it here —
   * use summary lines so the strip doesn’t look “removed”.
   */
  const insightBodyCandidate =
    verdictActionChip != null
      ? (humanizeDisplayToken(score.oneLineSummary) ??
        humanizeDisplayToken(score.holisticRationale) ??
        humanizeDisplayToken(score.aiSummary) ??
        null)
      : (humanizeDisplayToken(score.verdictAction) ??
        humanizeDisplayToken(score.oneLineSummary) ??
        humanizeDisplayToken(score.holisticRationale) ??
        null);
  const insightBodySuppressed =
    insightBodyCandidate != null &&
    ((whyPrimaryForDisplay != null &&
      insightDuplicatesWhyVerdictBody(insightBodyCandidate, whyPrimaryForDisplay)) ||
      (whyPrimaryRaw.trim() !== "" &&
        insightDuplicatesWhyVerdictBody(insightBodyCandidate, whyPrimaryRaw.trim())));
  const insightBody = insightBodySuppressed ? null : insightBodyCandidate;
  /** Insight strip badge — mockup-style “Hidden Gem”; header already shows primary verdict. */
  const insightBadge =
    hiddenGemHeuristic(score) || (score.verdict ?? "").toLowerCase().includes("hidden gem")
      ? "Hidden Gem"
      : null;
  const sessionLabel = score.id.length >= 6 ? score.id.slice(-6).toUpperCase() : score.id;
  const traceDisplay = score.provenanceHash
    ? `TH-${score.provenanceHash.slice(0, 8).toUpperCase()}`
    : `TH-SID-${score.id.slice(0, 8).toUpperCase()}`;
  const traceCopyValue = score.provenanceHash ?? score.id;
  const decisionStandardLabel =
    score.promptVersion?.trim() || score.modelVersion?.trim() || "Org criteria baseline";
  const controlsOk =
    !score.humanReviewRequired && !parseWarning && score.scoringStatus !== "failed";
  /**
   * Attribution: signal_score/grade_based_score only exist on legacy three-stage rows.
   * Hybrid rows carry the blend in primary_blend (skills 25% + intent 75%) — showing the
   * legacy strip there reads as "Rubric (n/a)" and implies 80% of the score is missing.
   */
  const signal = score.signalScore ?? null;
  const rubric = score.gradeBasedScore ?? null;
  const hasLegacyAttribution = signal != null && rubric != null;
  const total = hasLegacyAttribution ? signal + rubric : null;
  const signalPct = total && total > 0 ? Math.round((signal! / total) * 100) : 20;
  const rubricPct = total && total > 0 ? Math.max(0, 100 - signalPct) : 80;
  const hasBlendAttribution = score.skillsSignal != null && score.intentMatch != null;
  const hasScoreCalculationDetails = Boolean(score.blendReasoning || score.scoringFormula);

  return {
    parseWarning,
    marketValue,
    marketSub,
    idealDisplay,
    verdictQuotes,
    evidenceByCriterion,
    evidenceChips,
    gapItems,
    whyPrimaryForDisplay,
    amberItems,
    strengthItems,
    displayName,
    candidateInitial,
    roleLine,
    modelFootnote,
    primaryVerdictLabel,
    verdictActionChip,
    insightBody,
    insightBadge,
    sessionLabel,
    traceDisplay,
    traceCopyValue,
    decisionStandardLabel,
    controlsOk,
    signal,
    rubric,
    hasLegacyAttribution,
    signalPct,
    rubricPct,
    hasBlendAttribution,
    hasScoreCalculationDetails,
  };
}

/**
 * Deterministic FitScore when merged Sonnet extraction+verdict JSON fails hard.
 * One Sonnet attempt only — no model downgrade; regex/keyword signals fill gaps.
 */

import { logger } from "@/lib/observability/logger";
import { recordFitScoreObservabilityEvent } from "@/lib/fitscore/scoring-observability";
import { candidateExtractionSchema } from "@/lib/validations/fitscore-hybrid";
import { tryParsePartialHybridExtraction } from "./json-parser";
import { computeHybridScore } from "./engine";
import { topDimensions } from "./explanation";
import type {
  CandidateExtraction,
  HybridEvidenceJson,
  JDBaseDocument,
  ScoringWeights,
} from "./types";

const EDUCATION_KEYWORDS = [
  "bachelor",
  "b.tech",
  "btech",
  "master",
  "mba",
  "m.tech",
  "phd",
  "b.e",
  "bsc",
  "msc",
  "degree",
  "university",
  "college",
  "engineering",
];

const YEARS_PATTERNS = [
  /(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:experience|exp)/i,
  /(?:experience|exp)[:\s]+(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)/i,
  /(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\s+in\b/i,
];

function clampDim(n: number): number {
  if (!Number.isFinite(n)) return 3;
  return Math.min(10, Math.max(1, Math.round(n)));
}

export function extractYearsFromResume(resumeText: string): number {
  for (const pattern of YEARS_PATTERNS) {
    const m = resumeText.match(pattern);
    if (m?.[1]) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0 && n < 50) return n;
    }
  }
  return 0;
}

function dimensionKeywords(key: string): string[] {
  const parts = key
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter((p) => p.length > 2);
  return [...new Set(parts)];
}

function scoreDimensionFromResume(resumeLower: string, dimensionKey: string): number {
  const keywords = dimensionKeywords(dimensionKey);
  if (keywords.length === 0) return 4;
  let hits = 0;
  for (const kw of keywords) {
    if (resumeLower.includes(kw)) hits += 1;
  }
  return clampDim(3 + hits * 1.5);
}

function hasEducationSignals(resumeLower: string): boolean {
  return EDUCATION_KEYWORDS.some((k) => resumeLower.includes(k));
}

function buildDimensionScores(
  weights: ScoringWeights,
  resumeText: string,
  partial?: Record<string, number>,
): Record<string, number> {
  const resumeLower = resumeText.toLowerCase();
  const scores: Record<string, number> = {};
  for (const key of Object.keys(weights)) {
    if (typeof weights[key] !== "number" || weights[key] <= 0) continue;
    const fromPartial = partial?.[key];
    const keywordScore = scoreDimensionFromResume(resumeLower, key);
    scores[key] =
      fromPartial != null && Number.isFinite(fromPartial)
        ? clampDim((fromPartial + keywordScore) / 2)
        : keywordScore;
  }
  return scores;
}

function collectSkillSignals(resumeLower: string, weights: ScoringWeights): string[] {
  const signals: string[] = [];
  for (const key of Object.keys(weights)) {
    if (typeof weights[key] !== "number" || weights[key] <= 0) continue;
    if (dimensionKeywords(key).some((kw) => resumeLower.includes(kw))) {
      signals.push(`skill_match:${key}`);
    }
  }
  return signals;
}

export type DeterministicFallbackParams = {
  jdBase: JDBaseDocument;
  resumeText: string;
  candidateName?: string | null;
  rawLlmText?: string;
  jobId?: string;
  candidateId?: string;
};

export type DeterministicFallbackResult = {
  extraction: CandidateExtraction;
  verdictWhyBody: string;
  evidence: HybridEvidenceJson;
  signalsUsed: string[];
};

/**
 * Build a scored result without any additional LLM calls.
 */
export function buildDeterministicFallbackScore(
  params: DeterministicFallbackParams,
): DeterministicFallbackResult {
  const resumeBody = params.resumeText;
  const resumeLower = resumeBody.toLowerCase();
  const signalsUsed: string[] = [];

  let partialExtraction: Record<string, unknown> | null = null;
  if (params.rawLlmText) {
    const partial = tryParsePartialHybridExtraction(params.rawLlmText);
    if (partial.extraction) {
      partialExtraction = partial.extraction;
      signalsUsed.push("partial_llm_extraction");
    }
  }

  const yearsFromResume = extractYearsFromResume(resumeBody);
  if (yearsFromResume > 0) signalsUsed.push(`years_regex:${yearsFromResume}`);

  const partialYears =
    typeof partialExtraction?.total_years === "number" ? partialExtraction.total_years : null;
  const totalYears = yearsFromResume > 0 ? yearsFromResume : (partialYears ?? 0);

  const partialDimScores =
    partialExtraction?.dimension_scores &&
    typeof partialExtraction.dimension_scores === "object" &&
    !Array.isArray(partialExtraction.dimension_scores)
      ? (partialExtraction.dimension_scores as Record<string, number>)
      : undefined;

  const dimension_scores = buildDimensionScores(
    params.jdBase.weights,
    resumeBody,
    partialDimScores,
  );
  signalsUsed.push(...collectSkillSignals(resumeLower, params.jdBase.weights));

  if (hasEducationSignals(resumeLower)) signalsUsed.push("education_keywords");

  const jdLower =
    `${params.jdBase.roleTitle} ${params.jdBase.context} ${params.jdBase.company}`.toLowerCase();
  const locationTokens = jdLower.match(
    /\b(?:bangalore|bengaluru|hyderabad|mumbai|pune|chennai|remote|india)\b/g,
  );
  if (locationTokens?.some((t) => resumeLower.includes(t))) {
    signalsUsed.push("location_match");
  }

  const candidateName =
    (typeof partialExtraction?.candidate_name === "string"
      ? partialExtraction.candidate_name
      : null) ??
    params.candidateName?.trim() ??
    "Candidate";

  const extraction: CandidateExtraction = {
    candidate_name: candidateName,
    total_years: totalYears,
    dimension_scores,
    certifications: Array.isArray(partialExtraction?.certifications)
      ? (partialExtraction.certifications as string[])
      : [],
    quantified_impact: Array.isArray(partialExtraction?.quantified_impact)
      ? (partialExtraction.quantified_impact as string[])
      : [],
    red_flags: [],
    green_flags: signalsUsed.filter((s) => s.startsWith("skill_match:")).slice(0, 5),
    role_match_tag: "deterministic_fallback",
    summary: "Basic assessment from resume text signals (limited structured extraction).",
    ideal_match_pct:
      typeof partialExtraction?.ideal_match_pct === "number"
        ? partialExtraction.ideal_match_pct
        : undefined,
    ideal_gaps: Array.isArray(partialExtraction?.ideal_gaps)
      ? (partialExtraction.ideal_gaps as string[])
      : undefined,
  };

  const zod = candidateExtractionSchema.safeParse(extraction);
  const safeExtraction = zod.success ? zod.data : extraction;

  const { breakdown } = computeHybridScore(
    safeExtraction,
    params.jdBase.weights,
    params.jdBase.scoreFloor,
    params.jdBase.fitThresholds,
  );
  const topDims = topDimensions(breakdown, 2);
  const evidence: HybridEvidenceJson = {
    quotes: topDims.map((dimension) => ({
      dimension,
      quote: "NO_DEFENSIBLE_QUOTE",
      location_hint: "Deterministic fallback — limited extraction data",
    })),
  };

  const verdictWhyBody =
    "Basic assessment — limited data available. Score derived from resume keywords, experience signals, and any partial model output. Consider a manual rescore after resume quality improves.";

  logger.info(
    JSON.stringify({
      type: "fitscore_deterministic_fallback",
      candidate_id: params.candidateId ?? null,
      job_id: params.jobId ?? null,
      signals_used: signalsUsed,
    }),
  );
  recordFitScoreObservabilityEvent({
    eventType: "fitscore_deterministic_fallback",
    jobId: params.jobId,
    candidateId: params.candidateId,
    metadata: { signals_used: signalsUsed },
  });

  return {
    extraction: safeExtraction,
    verdictWhyBody,
    evidence,
    signalsUsed,
  };
}

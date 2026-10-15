import type { CandidateExtraction, HybridConfidence, HybridConfidenceBand } from "./types";
import { APPLICATION_CONFIDENCE_BONUS_MAX } from "./application-confidence-boost";

export interface HybridConfidenceContext {
  resumeText: string;
  extractionUsedVisionFallback: boolean;
  resumeTruncated: boolean;
  /** Extra signal from application hireability + screening (capped by APPLICATION_CONFIDENCE_BONUS_MAX). */
  applicationCompletenessBonus?: number;
}

export interface HybridConfidenceConfig {
  greenFlagWeight: number;
  certificationWeight: number;
  quantifiedImpactWeight: number;
  resumeWordCountWeight: number;
  resumeWordCountScale: number;
  redFlagPenaltyWeight: number;
  visionFallbackPenalty: number;
  truncationPenalty: number;
  minimumScore: number;
  maximumScore: number;
  highThreshold: number;
  mediumThreshold: number;
}

/**
 * Tuned for recruiter-facing UX: this score is **evidence richness** (flags, impacts, length),
 * not hire strength. Prior defaults skewed low because extractions often omit quantified_impact
 * rows and vision/truncation penalties stacked harshly.
 */
export const DEFAULT_HYBRID_CONFIDENCE_CONFIG: HybridConfidenceConfig = {
  greenFlagWeight: 0.17,
  certificationWeight: 0.11,
  quantifiedImpactWeight: 0.22,
  resumeWordCountWeight: 0.28,
  resumeWordCountScale: 650,
  redFlagPenaltyWeight: 0.055,
  visionFallbackPenalty: 0.08,
  truncationPenalty: 0.06,
  minimumScore: 0.12,
  maximumScore: 1,
  highThreshold: 0.58,
  mediumThreshold: 0.3,
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function toBand(score: number, config: HybridConfidenceConfig): HybridConfidenceBand {
  if (score >= config.highThreshold) return "high";
  if (score >= config.mediumThreshold) return "medium";
  return "low";
}

export function computeHybridConfidence(
  extraction: CandidateExtraction,
  context: HybridConfidenceContext,
  config: HybridConfidenceConfig = DEFAULT_HYBRID_CONFIDENCE_CONFIG,
): HybridConfidence {
  const greenCount = Array.isArray(extraction.green_flags) ? extraction.green_flags.length : 0;
  const certCount = Array.isArray(extraction.certifications) ? extraction.certifications.length : 0;
  const impactCount = Array.isArray(extraction.quantified_impact)
    ? extraction.quantified_impact.length
    : 0;
  const redCount = Array.isArray(extraction.red_flags) ? extraction.red_flags.length : 0;
  const wordCount = context.resumeText.trim().split(/\s+/).filter(Boolean).length;

  const hireabilityBonus = Math.max(
    0,
    Math.min(APPLICATION_CONFIDENCE_BONUS_MAX, context.applicationCompletenessBonus ?? 0),
  );

  const evidenceRichness = Math.min(
    1,
    greenCount * config.greenFlagWeight +
      certCount * config.certificationWeight +
      impactCount * config.quantifiedImpactWeight +
      Math.min(1, wordCount / config.resumeWordCountScale) * config.resumeWordCountWeight +
      hireabilityBonus,
  );

  const evidencePenalty =
    redCount * config.redFlagPenaltyWeight +
    (context.extractionUsedVisionFallback ? config.visionFallbackPenalty : 0) +
    (context.resumeTruncated ? config.truncationPenalty : 0);

  const score = clamp(evidenceRichness - evidencePenalty, config.minimumScore, config.maximumScore);

  return {
    score: Math.round(score * 1000) / 1000,
    band: toBand(score, config),
  };
}

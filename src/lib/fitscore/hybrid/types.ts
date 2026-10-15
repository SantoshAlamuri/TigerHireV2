/**
 * Hybrid FitScore v2 types — dynamic per-role dimensions.
 * Each JD Base defines its own 8 dimension names + weights (summing to 100).
 * The extraction prompt, engine, and explanation all adapt to whatever dimensions
 * the JD Base specifies.
 */

import type { IdealCandidateProfile, IdealMatchResult } from "./ideal-profile";
import type { MarketScore } from "./market-score";
import type { Verdict } from "./verdict";

export type { IdealCandidateProfile, IdealMatchResult, MarketScore, Verdict };
export type { HybridJdBaseRubricSnapshot } from "./rubric-snapshot";
export {
  HYBRID_JD_BASE_RUBRIC_SNAPSHOT_SCHEMA_VERSION,
  buildHybridJdBaseRubricSnapshot,
  isFitScoreJdBaseStale,
} from "./rubric-snapshot";

export interface FitThresholds {
  strong: number;
  good: number;
  moderate: number;
  weak: number;
}

/** Dynamic dimension weights — keys are role-specific (e.g. "core_language", "system_design"). */
export type ScoringWeights = Record<string, number>;

export interface JDBaseDocument {
  id: string;
  jobId: string;
  roleTitle: string;
  company: string;
  context: string;
  weights: ScoringWeights;
  scoreFloor: number;
  fitThresholds: FitThresholds;
  extractionAdditions?: string | null;
  idealCandidateProfile?: IdealCandidateProfile | null;
  /** NULL until a hiring manager reviews and approves the JD Base. Scoring is blocked until set. */
  approvedBy?: string | null;
  approvedAt?: string | null;
  structuredJd?: import("./structured-jd").StructuredJd | null;
  version?: number;
}

export interface RedFlag {
  flag: string;
  severity: "critical" | "moderate" | "minor";
}

export interface CandidateExtraction {
  candidate_name: string;
  total_years: number;
  /** Dynamic dimension scores — keys match the JD Base weights keys, values 1–10. */
  dimension_scores: Record<string, number>;
  certifications: string[];
  quantified_impact: string[];
  red_flags: RedFlag[];
  green_flags: string[];
  role_match_tag: string;
  summary: string;
  ideal_match_pct?: number;
  ideal_gaps?: string[];
}

export interface DimensionContribution {
  value: number;
  weight: number;
  contribution: number;
}

export interface ScoreBreakdown {
  rawDimScore: number;
  certBonus: number;
  impactBonus: number;
  greenBonus: number;
  redPenalty: number;
  redPenaltyUncapped: number;
  dimensions: Record<string, DimensionContribution>;
  formulaLines: string[];
}

export interface ShadowBlend {
  fitScore: number;
  marketPercentile: number | null;
  idealMatchPct: number;
  weights: { fit: number; market: number; ideal: number };
}

/**
 * v5 "outcomes-weighted" blend. Written to the shadow slot when `fitscore_v5` is enabled so it
 * can be compared against the live v2 primary before promotion. See engine-v5.ts.
 */
export interface FitScoreV5Blend {
  version: "v5_outcomes";
  weights: { skills: number; competency: number; outcomes: number };
  skills: number;
  competency: number;
  outcomes: number;
  quality: number;
  cert_nudge: number;
  red_penalty: number;
  formula: string;
}

export interface EvidenceQuote {
  dimension: string;
  quote: string;
  location_hint: string;
  /** Short exact resume locator; server resolves to verbatim quote when quote paraphrases. */
  quote_anchor?: string;
}

export interface HybridEvidenceJson {
  quotes: EvidenceQuote[];
  /** Optional Nuanced flags from merged extraction+verdict path (max 5 in prompt). */
  amber_flags?: string[];
}

export type HybridConfidenceBand = "high" | "medium" | "low";

export interface HybridConfidence {
  score: number;
  band: HybridConfidenceBand;
}

export interface HybridScoreResult {
  fitScore: number;
  fitLabel: string;
  fitLabelColor: string;
  extraction: CandidateExtraction;
  explanation: string;
  evidence: HybridEvidenceJson;
  breakdown: ScoreBreakdown;
  confidence: HybridConfidence;
  market: MarketScore;
  idealMatch: IdealMatchResult;
  verdict: Verdict;
  shadowScore: number;
  shadowBlend: ShadowBlend | FitScoreV5Blend;
  /** Pre-blend dimension engine score (when blend v2 enabled). */
  engineFitScore?: number;
  primaryScore?: number | null;
  primaryBlend?: Record<string, unknown> | null;
  signalsLog?: Record<string, unknown>;
}

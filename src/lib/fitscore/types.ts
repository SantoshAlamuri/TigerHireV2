/**
 * FitScore types: three-stage result shape + legacy JobData/CandidateData for service and agents.
 */

export type FitScoreConfidence = "high" | "medium" | "low";

/** Rule-based signals (used by signals.ts). */
export interface FitScoreSignals {
  strategySignalRatio: number;
  jdExecutionFocused: boolean;
  missingRequiredSkillsCount: number;
  recentSkillsFraction: number;
  seniorityMismatch: "too_senior" | "too_junior" | "match";
  locationTier: "remote" | "exact" | "same_region" | "same_country" | "different_country";
  employmentFlags: string[];
  unexplainedGapMonths: number | null;
  maxGapMonthsInLast36: number | null;
  isCurrentlyContractOrFreelance: boolean;
  specificityMultiplier: number;
  confidenceFactors: { low: string[]; high: string[] };
}

export interface JobData {
  id: string;
  title: string;
  description: string;
  location: string | null;
  status: string;
  compensation_min: number | null;
  compensation_max: number | null;
  organisation_id: string;
  skills_required?: string[] | null;
}

export interface CandidateData {
  id: string;
  name: string | null;
  skills: string[] | null;
  experience_years: number | null;
  location: string | null;
  intent_score: number | null;
  resume_url: string | null;
  updated_at?: string | null;
  cv_raw_text?: string | null;
  current_role?: string | null;
  current_company?: string | null;
  seniority_level?: string | null;
  full_name?: string | null;
}

/** Three-stage result and related types (re-export from three-stage). */
export type {
  Grade,
  RubricCriterion,
  RoleIntelligence,
  CriterionEvidence,
  CandidateIntelligence,
  FitScoreResult,
  ProvenanceRecord,
  DatabaseAdapter,
} from "./three-stage/types";

export { GRADE_POINTS, sha256, validateRubricWeights, calculatePoints } from "./three-stage/types";

/** Legacy keys for criteria (used by UI until fully migrated to criteria_breakdown). */
export const V2_CRITERIA_KEYS = [
  "primary_skill_match",
  "experience_depth",
  "impact_outcomes",
  "domain_context",
  "role_level",
  "supporting_skills",
  "resume_quality",
] as const;

export type V2CriteriaKey = (typeof V2_CRITERIA_KEYS)[number];

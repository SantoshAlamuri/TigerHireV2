// TigerHire FitScore - Three-Stage Type System
// Production spec March 2026

import crypto from "crypto";
import type { FitscoreExtractionLogInsert } from "../fitscore-extraction-log";

// ===== GRADE SYSTEM =====
export type Grade = "A" | "B" | "C" | "D" | "E";

export const GRADE_POINTS: Record<Grade, number> = {
  A: 100,
  B: 75,
  C: 50,
  D: 25,
  E: 0,
};

// ===== STAGE 1 OUTPUT: LOCKED RUBRIC =====
export interface RubricCriterion {
  id: string;
  name: string;
  weight: number;
  description: string;
  evidence_rules: { A: string; B: string; C: string; D: string; E: string };
}

export interface RoleIntelligence {
  job_id: string;
  role_title: string;
  role_type: "execution" | "strategy" | "leadership" | "hybrid";
  primary_function: string;
  seniority: "junior" | "mid" | "senior" | "lead";
  domain: string;
  criteria: RubricCriterion[];
  model_version: string;
  prompt_version: string;
  created_at: string;
}

// ===== STAGE 2a: FACTUAL EXTRACTION (LLM output) =====
export type OwnershipLevel = "owned" | "led" | "contributed" | "mentioned_only" | "absent";

export interface CriterionFacts {
  criterion_id: string;
  ownership: OwnershipLevel;
  evidence_quote: string;
  duration_months: number;
  is_current_role: boolean;
  named_outputs: string[];
  quantified_outcomes: string[];
  tools_demonstrated: string[];
}

export interface Stage2aExtraction {
  name: string;
  total_years: number;
  current_role: string;
  career_direction: "ascending" | "lateral" | "pivoting" | "early_career";
  criteria_facts: CriterionFacts[];
}

// ===== STAGE 2 HYBRID v2.0: CV FACTS EXTRACTION =====
export interface CVFacts {
  skills: string[];
  named_tools: string[];
  named_deliverables: string[];
  metrics: string[];
  years_per_company: {
    company: string;
    role: string;
    years: number;
  }[];
  total_years: number;
  current_role: string;
  career_trajectory: "ascending" | "lateral" | "pivoting" | "descending";
  professional_identity: string;
}

// ===== STAGE 2 OUTPUT: CANDIDATE EVIDENCE =====
export interface CriterionEvidence {
  criterion_id: string;
  grade: Grade;
  evidence_text: string;
  reasoning: string;
}

export interface CandidateIntelligence {
  candidate_id: string;
  name: string;
  total_years: number;
  current_role: string;
  career_trajectory: "ascending" | "lateral" | "pivoting" | "descending" | "early_career";
  evidence: CriterionEvidence[];
  professional_identity: string;
  model_version: string;
  prompt_version: string;
  created_at: string;
  parse_method: string;
  parse_quality: string;
  profile_completeness: number;
  /** Stage 1 prompt_version when this was produced; used to invalidate cache when rubric changes */
  rubric_prompt_version?: string;
  /** v2.0: 0–1 parse quality (Stage 0 body text). */
  parse_quality_score?: number;
  /** v2.0: analytics label — haiku | sonnet */
  extraction_model?: string;
  /** v2.0: Sonnet tier-2 re-extraction due to quality or coverage */
  extraction_fallback?: boolean;
}

// ===== FLAGS (deterministic from grades + signal) =====
export interface FitScoreFlag {
  type: "green" | "amber" | "red";
  criterion: string;
  message: string;
  evidence: string;
}

// ===== STAGE 3 OUTPUT: SCORE WITH PROVENANCE =====
export interface FitScoreResult {
  score: number;
  band: "Strong Fit" | "Good Fit" | "Moderate Fit" | "Weak Fit" | "Not a Fit";
  confidence: "high" | "medium" | "low";
  criteria_breakdown: {
    criterion_id: string;
    criterion_name: string;
    weight: number;
    grade: Grade;
    points_earned: number;
    evidence_text: string;
    evidence_rule_matched: string;
    reasoning?: string;
  }[];
  key_strengths: string[];
  key_gaps: string[];
  /** Partial evidence (grade C) — present but not deep. */
  amber_flags?: FitScoreFlag[];
  /** Strong evidence (grade A/B, signal, trajectory). */
  green_flags?: FitScoreFlag[];
  /** Missing/weak evidence (grade D/E on important criteria). */
  red_flags?: FitScoreFlag[];
  one_line_summary: string;
  provenance: ProvenanceRecord;
  /** Signal breakdown (when blend ran); for display/audit. */
  signal_breakdown?: Record<string, number>;
  /** Rubric-derived keywords matched in resume (when blend ran). */
  matched_keywords?: string[];
  /** Dual score: shadow blend (40% signal + 60% grade). */
  shadow_score?: number;
  /** Grade-based score (0–100) from criteria. */
  grade_score?: number;
  /** Signal score (0–100). Stored on result for display. */
  signal_score_result?: number;
  /** Primary blend (20/80) breakdown. */
  primary_blend?: {
    signal_weighted: number;
    grade_weighted: number;
    formula: string;
  };
  /** Shadow blend (40/60) breakdown. */
  shadow_blend?: {
    signal_weighted: number;
    grade_weighted: number;
    formula: string;
  };
  /** Recruiter chose primary or shadow (for calibration). */
  recruiter_selected?: "primary" | "shadow" | null;
  /** Recruiter override score if they entered a custom value. */
  recruiter_override?: number | null;
  /** Missing must-have skills from job requirements. */
  missing_must_haves?: string[];
}

export interface ProvenanceRecord {
  provenance_hash: string;
  rubric_id: string;
  candidate_profile_id: string;
  jd_text_hash: string;
  resume_text_hash: string;
  model_versions: { stage1: string; stage2: string };
  prompt_versions: { stage1: string; stage2: string };
  scoring_formula: string;
  scored_at: string;
  /** Signal-layer score (0–100); part of blend. */
  signal_score: number;
  /** Grade-based score (0–100) from criteria; part of blend. */
  grade_based_score: number;
  /** Blend weights used: signal × 0.2 + grade × 0.8. */
  blend_weights?: { signal: number; grade: number };
  /** Human-readable blend reasoning (when signal layer ran). */
  blend_reasoning?: string;
}

/** v2.0: optional resume metadata for extraction_log (no PII). */
export interface FitScoreStage0Meta {
  resume_format?: string | null;
  resume_pages?: number | null;
  has_tables?: boolean | null;
  has_columns?: boolean | null;
}

// ===== DATABASE INTERFACE =====
export interface DatabaseAdapter {
  roleIntelligence: {
    get(job_id: string): Promise<RoleIntelligence | null>;
    set(job_id: string, data: RoleIntelligence): Promise<void>;
  };
  candidateIntelligence: {
    get(
      candidate_id: string,
      job_id: string,
      rubric_prompt_version?: string,
    ): Promise<CandidateIntelligence | null>;
    set(
      candidate_id: string,
      job_id: string,
      data: CandidateIntelligence,
      extraction_facts?: CVFacts,
    ): Promise<void>;
  };
  fitScores: {
    upsert(data: {
      candidate_id: string;
      job_id: string;
      score: number;
      band: string;
      confidence: string;
      criteria_breakdown: unknown;
      key_strengths: string[];
      key_gaps: string[];
      one_line_summary: string;
      provenance_hash: string;
      scoring_formula: string;
      rubric_snapshot: RoleIntelligence;
      evidence_snapshot: CandidateIntelligence;
      /** Dimension model: scope/impact/autonomy extraction */
      dimensions_json?: unknown;
      dimension_reasoning?: string;
      prompt_version?: string;
      /** Signal-layer score (0–100); stored in provenance. */
      signal_score?: number;
      /** Grade-based score (0–100); stored in provenance. */
      grade_based_score?: number;
      signal_breakdown?: unknown;
      matched_keywords?: string[];
      blend_reasoning?: string;
      green_flags?: FitScoreFlag[];
      amber_flags?: FitScoreFlag[];
      red_flags?: FitScoreFlag[];
      primary_score?: number;
      shadow_score?: number;
      primary_blend?: unknown;
      shadow_blend?: unknown;
      recruiter_selected?: string | null;
      recruiter_override?: number | null;
      /** Missing must-have skills from job requirements. */
      missing_must_haves?: string[];
      /** Mark as test run (sets is_test_run=true, allows multiple rows per candidate+job) */
      is_test_run?: boolean;
      parse_quality_score?: number | null;
      extraction_model?: string | null;
      extraction_fallback?: boolean | null;
    }): Promise<void>;
  };
  /** v2.0: append-only extraction audit (failures, fallbacks, success). */
  extractionLog?: {
    insert(row: FitscoreExtractionLogInsert): Promise<void>;
  };
}

export function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function validateRubricWeights(criteria: RubricCriterion[]): void {
  const sum = criteria.reduce((acc, c) => acc + c.weight, 0);
  if (sum !== 100) {
    throw new Error(`Rubric weights must sum to 100, got ${sum}`);
  }
}

export function calculatePoints(grade: Grade, weight: number): number {
  return Math.round((GRADE_POINTS[grade] * weight) / 100);
}

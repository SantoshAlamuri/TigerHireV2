/**
 * Minimal v3 types for resume fetch helpers.
 * CandidateProfile is used by checkProfileCompleteness().
 */

export interface CurrentRole {
  title: string;
  company: string;
  duration_months: number;
  is_current: boolean;
}

export interface SkillWithEvidence {
  skill: string;
  evidence_level: "owned" | "led" | "contributed" | "listed_only";
  context: string;
  years_used: number;
}

export interface DesignSystemEntry {
  name: string;
  role: "created" | "led" | "maintained" | "contributed";
  duration_months: number;
  details: string;
}

export interface CandidateProfile {
  name: string;
  location: string;
  total_years: number;
  current_role: CurrentRole;
  skills_with_evidence: SkillWithEvidence[];
  design_systems: DesignSystemEntry[];
  quantified_outcomes: string[];
  tools: string[];
  career_trajectory: "ascending" | "lateral" | "descending" | "mixed";
  domain_experience: string[];
  red_flags: string[];
  green_flags: string[];
}

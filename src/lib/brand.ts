/**
 * Brand display name mapping — internal code names → external brand names.
 *
 * Internal code keeps `fitscore`, `fit_scores`, etc. for stability.
 * This module is the single source of truth for all customer-facing labels.
 *
 * Usage:
 *   import { BRAND } from "@/lib/brand";
 *   <h2>{BRAND.productName}</h2>
 *   <MetricCard label={BRAND.score} ... />
 */

export const BRAND = {
  /** Top-level product name for marketing / headings */
  productName: "TigerHire Talent Intelligence",

  /** Short product name when context is obvious */
  productShort: "Talent Intelligence",

  /** The numeric role-fit score shown in product UI */
  score: "FitScore",

  /** Short form for tight spaces (metric cards, badges) */
  scoreShort: "Score",

  /** The verdict row label */
  verdict: "Hiring Verdict",

  /** Market percentile ranking label */
  marketPosition: "Market Position",

  /** Ideal candidate comparison label */
  profileMatch: "Profile Match",

  /** Shadow score tooltip descriptor */
  shadowTooltip: "Blended talent intelligence (40% FitScore + 30% Market + 30% Profile Match)",

  /** Orchestrator step that was "FitScore Sourcing" */
  sourcingStep: "Intelligence Sourcing",

  /** Nav label for candidate scores page */
  candidateScoresNav: "My Scores",

  /** Section heading on recruiter cards */
  shortlistHeading: "Shortlist",

  /** Override modal heading */
  overrideHeading: "Override recommendation?",

  /** Override feedback prompt */
  overrideFeedback: "Help us improve scoring by sharing why you're making this decision:",
} as const;

export type BrandKey = keyof typeof BRAND;

/**
 * Verdict labels are already customer-ready (Strong Hire, Hidden Gem, etc.)
 * and don't need remapping. This map only covers internal action strings
 * that previously referenced "FitScore" in cold-start / fallback text.
 */
export const VERDICT_ACTIONS = {
  coldStartHigh: "Market data building — score indicates good match",
  coldStartLow: "Market data building — review score details",
} as const;

/**
 * Billing plan feature labels (replaces "Basic FitScore", "Advanced FitScore", etc.)
 */
export const PLAN_SCORE_LABELS: Record<string, string> = {
  free: "Basic scoring",
  starter: "Standard scoring",
  growth: "Advanced scoring",
  scale: "Premium scoring",
  enterprise: "Custom scoring models",
} as const;

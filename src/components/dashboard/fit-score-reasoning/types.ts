import type { FitScore } from "@/types";

export type FitScoreReasoningPanelProps = {
  score: FitScore;
  /** super_admin-only: parse-quality banner, attribution bar. */
  showSuperAdminDiagnostics?: boolean;
  /**
   * Header candidate name override (e.g. agency shows masked name until unlock).
   * Defaults to `score.candidateName`.
   */
  candidateDisplayName?: string;
  /**
   * Shortlist / job row layout — same FitRing + metric cues as the full verdict panel.
   * Use `compactHref` or `compactOnNavigate` for navigation.
   */
  compact?: boolean;
  compactHref?: string;
  compactOnNavigate?: () => void;
  /** Referral attribution for this job (from pipeline / application when available). */
  moatReferrer?: {
    referrerName?: string | null;
    referrerOrgVerified?: boolean;
    referrerVerifiedOrgName?: string | null;
    parentReferrerName?: string | null;
  };
  /**
   * Deterministic logistics/readiness signal (computeReadiness). When provided, the tile row
   * shows the four-score model: FitScore (quality) · Readiness (logistics) · ICP · Market.
   * Readiness never feeds the verdict — it annotates hireability.
   */
  readiness?: import("@/lib/fitscore/readiness").ReadinessResult | null;
  /** Page shows the Decision Band above — skip the panel's own verdict hero to avoid duplication. */
  hideHero?: boolean;
};

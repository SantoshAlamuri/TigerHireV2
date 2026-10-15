/**
 * Ideal Candidate Profile — generated with JD Base, compared per candidate.
 */

export interface IdealCandidateProfile {
  summary: string;
  must_haves: string[];
  nice_to_haves: string[];
  years_range: string;
  benchmarks: Record<string, string>;
  /**
   * Ranked, measurable results the hire must deliver in the first 6–12 months — the outcomes-first
   * "spine" of the profile (Topgrading/Who scorecard). Additive: defined here for the ICP wizard and
   * generation; scoring may match candidates against these in a later step (v5.x). Optional so
   * existing profiles remain valid.
   */
  outcomes?: string[];
  /**
   * Role-specific behavioural competencies — the highest-validity predictor in the research
   * (structured interview / behavioural evidence, ~.42). Each phrased as an observable capability
   * ("what good looks like" for a behaviour), distinct from the softer, general `traits`. Additive
   * and optional; a later step can level these (1–5) and attach evidence anchors.
   */
  competencies?: string[];
  /** Soft attributes (ownership, communication, etc.) */
  traits?: string[];
  /** Career-shape preferences (product company, agile teams, etc.) */
  background_preferences?: string[];
}

export interface IdealMatchResult {
  ideal_match_pct: number;
  ideal_gaps: string[];
}

/** Type guard for IdealCandidateProfile from raw DB JSONB. */
export function isIdealCandidateProfile(v: unknown): v is IdealCandidateProfile {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (
    typeof o.summary !== "string" ||
    !Array.isArray(o.must_haves) ||
    !Array.isArray(o.nice_to_haves) ||
    typeof o.years_range !== "string" ||
    typeof o.benchmarks !== "object" ||
    o.benchmarks === null
  ) {
    return false;
  }
  if (o.outcomes !== undefined && !Array.isArray(o.outcomes)) return false;
  if (o.competencies !== undefined && !Array.isArray(o.competencies)) return false;
  if (o.traits !== undefined && !Array.isArray(o.traits)) return false;
  if (o.background_preferences !== undefined && !Array.isArray(o.background_preferences)) {
    return false;
  }
  return true;
}

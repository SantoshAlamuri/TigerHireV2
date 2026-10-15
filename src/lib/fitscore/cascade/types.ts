/** Cascade layer that resolved a verdict. Mirrors the CHECK constraints in 20260617230000_cascade_foundation.sql. */
export type CascadeLayer =
  | "LAYER_0_KNOCKOUT"
  | "LAYER_0_QUALIFY"
  | "LAYER_1"
  | "LAYER_2"
  | "LAYER_3"
  | "CACHE_HIT";

/** Status returned by Layer 0. AMBIGUOUS means "fall through to next layer". */
export type LayerZeroStatus = "rejected" | "qualified" | "continue";

/**
 * Subset of parsed candidate / JD fields Layer 0 needs. Deliberately small —
 * Layer 0 only acts on OBJECTIVE, HIGH-CONFIDENCE fields. Anything ambiguous
 * (skill match nuance, soft requirements) is the LLM's job.
 */
export interface ParsedCandidateForCascade {
  totalYearsExp?: number | null;
  currentLocation?: string | null;
  /** Uppercase degree codes (e.g. ["BTECH", "MTECH"]). */
  degrees?: string[] | null;
}

export interface ParsedJdForCascade {
  minYearsExp?: number | null;
  location?: string | null;
  mustBeLocal?: boolean | null;
  /** Uppercase degree codes that satisfy the JD (any match qualifies). */
  requiredDegrees?: string[] | null;
}

export interface LayerZeroResult {
  layer: "LAYER_0_KNOCKOUT" | "LAYER_0_QUALIFY" | "AMBIGUOUS";
  status: LayerZeroStatus;
  reason?: string;
}

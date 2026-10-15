import type { LayerZeroResult, ParsedCandidateForCascade, ParsedJdForCascade } from "./types";

/**
 * Layer 0 — deterministic gatekeeper. Decides KNOCKOUT / AUTO-QUALIFY / AMBIGUOUS.
 *
 * Discipline: this function ONLY operates on objective, high-confidence,
 * parser-verified fields. Anything fuzzy (skill match nuance, "similar role",
 * culture fit, gut-feel signals) MUST be left to Layers 1/2/3 — Layer 0 acts on
 * arithmetic and string equality only.
 *
 * Returns AMBIGUOUS whenever the parser was uncertain (field is null/undefined).
 * Falling through is always safe; mis-knocking-out a viable candidate is not.
 */
export function evaluateLayerZero(
  candidate: ParsedCandidateForCascade,
  jd: ParsedJdForCascade,
): LayerZeroResult {
  // Knockout: hard experience floor.
  if (typeof jd.minYearsExp === "number" && typeof candidate.totalYearsExp === "number") {
    if (candidate.totalYearsExp < jd.minYearsExp) {
      return {
        layer: "LAYER_0_KNOCKOUT",
        status: "rejected",
        reason: `Experience gap: has ${candidate.totalYearsExp} years, JD requires ${jd.minYearsExp}+`,
      };
    }
  }

  // Knockout: location mismatch when the JD declares it non-negotiable.
  if (jd.mustBeLocal && candidate.currentLocation && jd.location) {
    if (candidate.currentLocation.trim().toLowerCase() !== jd.location.trim().toLowerCase()) {
      return {
        layer: "LAYER_0_KNOCKOUT",
        status: "rejected",
        reason: `Location mismatch: requires ${jd.location}, candidate is in ${candidate.currentLocation}`,
      };
    }
  }

  // Knockout: required degree floor (any one match qualifies).
  if (
    Array.isArray(jd.requiredDegrees) &&
    jd.requiredDegrees.length > 0 &&
    Array.isArray(candidate.degrees) &&
    candidate.degrees.length > 0
  ) {
    const required = new Set(jd.requiredDegrees.map((d) => d.toUpperCase()));
    const hasMatch = candidate.degrees.some((d) => required.has(d.toUpperCase()));
    if (!hasMatch) {
      return {
        layer: "LAYER_0_KNOCKOUT",
        status: "rejected",
        reason: `Education mismatch: lacks required degree (${jd.requiredDegrees.join(", ")})`,
      };
    }
  }

  // Nothing tripped — let the LLM layers reason about the rest.
  return { layer: "AMBIGUOUS", status: "continue" };
}

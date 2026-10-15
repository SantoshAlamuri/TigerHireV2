/**
 * Centralized Anthropic model selection.
 *
 * **Single source of truth.** Every Anthropic call should import from here
 * rather than hardcoding a model ID. To migrate models when one deprecates:
 * change the value in this file. The weekly GitHub Actions deprecation check
 * (`scripts/check-anthropic-deprecations.mjs`) verifies these against the
 * Anthropic Models API and opens an issue when migration is needed.
 *
 * Use the alias form (`claude-sonnet-4-6`), not the date-suffixed form
 * (`claude-sonnet-4-20250514`). Aliases auto-resolve to the latest snapshot.
 *
 * Catalog reference: https://platform.claude.com/docs/en/about-claude/models/overview
 */

export const MODELS = {
  /**
   * Mid-tier Sonnet — balanced speed and intelligence. Default for most agent
   * calls (JD parsing, candidate scoring, hiring signal, talent scout, vouch).
   */
  SONNET: "claude-sonnet-4-6",

  /**
   * Fast Haiku — cost-optimized for high-volume operations (CV parsing,
   * three-stage stage-2 candidate intel, hybrid evidence scoring).
   */
  HAIKU: "claude-haiku-4-5",

  /**
   * Premium Opus — for complex reasoning. Use when correctness matters more
   * than cost (vision fallback, deep cross-org analysis). Currently unused
   * by default in any agent path; reserved for explicit per-call overrides.
   */
  OPUS: "claude-opus-4-7",
} as const;

export type ModelTier = keyof typeof MODELS;
export type ModelId = (typeof MODELS)[ModelTier];

/**
 * Resolve the JD parsing/generation model. Honors the `ANTHROPIC_JD_MODEL`
 * env override (e.g., set to `claude-opus-4-6` for max quality), otherwise
 * falls back to the default Sonnet.
 */
export function getJdParseModel(): string {
  return (typeof process !== "undefined" && process.env.ANTHROPIC_JD_MODEL) || MODELS.SONNET;
}

/**
 * Resolve the FitScore hybrid Haiku model. Honors the
 * `FITSCORE_HYBRID_HAIKU_MODEL` env override.
 */
export function getFitscoreHybridHaikuModel(): string {
  return (
    (typeof process !== "undefined" && process.env.FITSCORE_HYBRID_HAIKU_MODEL) || MODELS.HAIKU
  );
}

/**
 * Resolve the FitScore hybrid scoring model (extraction + merged verdict).
 * Fallback chain: `FITSCORE_HYBRID_MODEL` → `FITSCORE_HYBRID_HAIKU_MODEL` → Sonnet default.
 */
export function getFitscoreHybridModel(): string {
  if (typeof process !== "undefined" && process.env.FITSCORE_HYBRID_MODEL) {
    return process.env.FITSCORE_HYBRID_MODEL;
  }
  if (typeof process !== "undefined" && process.env.FITSCORE_HYBRID_HAIKU_MODEL) {
    return process.env.FITSCORE_HYBRID_HAIKU_MODEL;
  }
  return MODELS.SONNET;
}

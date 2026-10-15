/** Resume parse tier chain + deterministic fallback feature flags and thresholds. */

export function getResumeParseMinChars(): number {
  const n = Number(process.env.RESUME_PARSE_MIN_CHARS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 2000;
}

/** Tier 2 Haiku text enrichment when pdfjs body is below min chars. Default on. */
export function isCvParserHaikuEnabled(): boolean {
  return process.env.FF_CV_PARSER_HAIKU_ENABLED !== "false";
}

/** Tier 3 Sonnet vision on PDF. Default on (fires only when tiers 1–2 insufficient). */
export function isVisionFallbackEnabled(): boolean {
  return process.env.FF_VISION_FALLBACK_ENABLED !== "false";
}

/** Deterministic scoring when merged Sonnet JSON fails hard. Default on. */
export function isDeterministicFallbackEnabled(): boolean {
  return process.env.FF_DETERMINISTIC_FALLBACK_ENABLED !== "false";
}

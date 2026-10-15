/**
 * FitScore v2.0 — numeric parse quality (0–1) after Stage 0 text extraction.
 * Spec: weighted blend of section coverage, entity density, length, dates, OCR noise.
 */

export const PARSE_QUALITY_THRESHOLD = 0.8;

const STOPWORDS = new Set([
  "that",
  "this",
  "with",
  "from",
  "have",
  "been",
  "were",
  "their",
  "them",
  "they",
  "will",
  "would",
  "could",
  "should",
  "more",
  "than",
  "also",
  "into",
  "over",
  "such",
  "about",
  "between",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "each",
  "every",
  "both",
  "other",
  "some",
  "most",
  "within",
  "across",
  "along",
  "under",
  "and",
  "the",
  "for",
  "are",
  "but",
  "not",
  "you",
  "all",
  "can",
  "her",
  "was",
  "one",
  "our",
  "out",
  "day",
  "get",
  "has",
  "him",
  "his",
  "how",
  "its",
  "may",
  "new",
  "now",
  "old",
  "see",
  "two",
  "who",
  "way",
]);

function computeSectionCoverage(text: string): number {
  const lower = text.toLowerCase();
  let found = 0;
  if (/\b(experience|employment|work history|professional experience)\b/i.test(lower)) found += 1;
  if (/\b(education|academic|qualification|university|degree)\b/i.test(lower)) found += 1;
  if (/\b(skills|technical skills|competencies|technologies|tools)\b/i.test(lower)) found += 1;
  return found / 3;
}

function computeEntityDensity(text: string): number {
  const trimmed = text.trim();
  if (!trimmed.length) return 0;
  const words = trimmed.split(/\s+/);
  const meaningful = words.filter(
    (w) => w.length > 3 && !STOPWORDS.has(w.toLowerCase().replace(/[^a-z]/gi, "")),
  );
  const per100 = (meaningful.length / trimmed.length) * 100;
  if (per100 > 15) return 1;
  if (per100 >= 10) return 0.7;
  if (per100 >= 5) return 0.4;
  return 0.1;
}

function computeLengthScore(text: string): number {
  const n = text.length;
  if (n > 2000) return 1;
  if (n >= 1000) return 0.7;
  if (n >= 500) return 0.4;
  return 0.1;
}

function computeDatePresence(text: string): number {
  const years = text.match(/\b(19|20)\d{2}\b/g) ?? [];
  const unique = new Set(years);
  if (unique.size >= 2) return 1;
  if (unique.size === 1) return 0.5;
  return 0;
}

/** OCR / layout artefact patterns (spec: |||, em dashes runs, random symbols). */
function computeOCRNoise(text: string): number {
  const pipeRuns = (text.match(/\|{3,}/g) ?? []).length;
  const dashRuns = (text.match(/[—–\-]{5,}/g) ?? []).length;
  const weird = (text.match(/[^\w\s.,;:%@#&()/+\-—–'"`]/g) ?? []).length;
  const artefacts = pipeRuns + dashRuns + Math.min(weird, 20);
  if (artefacts === 0) return 1;
  if (artefacts <= 3) return 0.6;
  return 0.2;
}

/**
 * Returns 0–1 parse quality score for extracted resume body text.
 */
export function computeParseQualityScore(text: string): number {
  const sectionScore = computeSectionCoverage(text);
  const entityScore = computeEntityDensity(text);
  const lengthScore = computeLengthScore(text);
  const dateScore = computeDatePresence(text);
  const noiseScore = computeOCRNoise(text);

  const raw =
    sectionScore * 0.3 +
    entityScore * 0.25 +
    lengthScore * 0.2 +
    dateScore * 0.15 +
    noiseScore * 0.1;

  return Math.round(Math.min(1, Math.max(0, raw)) * 1000) / 1000;
}

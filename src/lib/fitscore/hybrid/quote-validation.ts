/**
 * Model-independent evidence quote validation and normalization.
 * Fixes substring false negatives (whitespace / smart quotes) and resolves locators in code.
 */

import type { EvidenceQuote, HybridEvidenceJson } from "./types";

export const NO_DEFENSIBLE_QUOTE = "NO_DEFENSIBLE_QUOTE";
const MAX_QUOTE_CHARS = 200;
const MAX_TOTAL_QUOTED_CHARS = 600;
const MIN_ANCHOR_CHARS = 12;

const SMART_QUOTE_MAP: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201a": "'",
  "\u201b": "'",
  "\u201c": '"',
  "\u201d": '"',
  "\u201e": '"',
  "\u201f": '"',
  "\u00a0": " ",
  "\u200b": "",
  "\u200c": "",
  "\u200d": "",
  "\ufeff": "",
};

/** Collapse whitespace and normalize unicode for tolerant resume↔quote matching. */
export function normalizeTextForMatch(input: string): string {
  let s = input.normalize("NFKC");
  for (const [from, to] of Object.entries(SMART_QUOTE_MAP)) {
    s = s.split(from).join(to);
  }
  return s.replace(/\s+/g, " ").trim();
}

/** Truncate at the last word boundary at or before maxLen (avoids mid-word cuts). */
export function truncateAtWordBoundary(text: string, maxLen: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  const slice = trimmed.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > 0) return slice.slice(0, lastSpace).trimEnd();
  return slice.trimEnd();
}

type NormChar = { origIndex: number; char: string };

function buildNormalizedIndex(original: string): { normalized: string; chars: NormChar[] } {
  const chars: NormChar[] = [];
  let pendingSpace = false;

  for (let i = 0; i < original.length; i += 1) {
    let ch = original[i] ?? "";
    if (ch in SMART_QUOTE_MAP) {
      ch = SMART_QUOTE_MAP[ch] ?? ch;
    } else {
      ch = ch.normalize("NFKC");
    }
    if (ch === "" || ch === "\u200b") continue;

    if (/\s/.test(ch)) {
      pendingSpace = true;
      continue;
    }
    if (pendingSpace && chars.length > 0) {
      chars.push({ origIndex: i, char: " " });
      pendingSpace = false;
    }
    chars.push({ origIndex: i, char: ch });
  }

  return { normalized: chars.map((c) => c.char).join(""), chars };
}

/** Map a span in normalized text back to a verbatim substring of the original resume. */
export function mapNormalizedSpanToOriginal(
  original: string,
  normStart: number,
  normLength: number,
): { text: string; start: number; end: number } | null {
  if (normLength <= 0) return null;
  const { chars } = buildNormalizedIndex(original);
  if (normStart < 0 || normStart + normLength > chars.length) return null;

  const startOrig = chars[normStart]?.origIndex;
  const endOrig = chars[normStart + normLength - 1]?.origIndex;
  if (startOrig == null || endOrig == null) return null;

  return {
    text: original.slice(startOrig, endOrig + 1),
    start: startOrig,
    end: endOrig,
  };
}

export function spansOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/** Resume character range the model pointed at (anchor, quote, or location hint). */
export function findIntentRegionInResume(
  resumeText: string,
  cues: Array<string | undefined | null>,
): { start: number; end: number } | null {
  for (const raw of cues) {
    const cue = raw?.trim();
    if (!cue || cue === NO_DEFENSIBLE_QUOTE) continue;

    const rawIdx = resumeText.indexOf(cue);
    if (rawIdx >= 0) {
      return { start: rawIdx, end: rawIdx + cue.length - 1 };
    }

    const { normalized } = buildNormalizedIndex(resumeText);
    const nCue = normalizeTextForMatch(cue);
    if (!nCue) continue;
    const nIdx = normalized.indexOf(nCue);
    if (nIdx < 0) continue;
    const mapped = mapNormalizedSpanToOriginal(resumeText, nIdx, nCue.length);
    if (!mapped) continue;
    return { start: mapped.start, end: mapped.end };
  }
  return null;
}

function allNormalizedMatchIndices(normalized: string, nQuote: string): number[] {
  const indices: number[] = [];
  let from = 0;
  while (from <= normalized.length - nQuote.length) {
    const idx = normalized.indexOf(nQuote, from);
    if (idx < 0) break;
    indices.push(idx);
    from = idx + 1;
  }
  return indices;
}

function pickNormalizedMatch(
  resumeText: string,
  nQuote: string,
  intent: { start: number; end: number } | null,
): string | null {
  const { normalized } = buildNormalizedIndex(resumeText);
  const indices = allNormalizedMatchIndices(normalized, nQuote);
  if (indices.length === 0) return null;

  let best: string | null = null;
  let bestScore = -1;

  for (const nIdx of indices) {
    const mapped = mapNormalizedSpanToOriginal(resumeText, nIdx, nQuote.length);
    if (!mapped) continue;

    if (!intent) {
      return truncateAtWordBoundary(mapped.text, MAX_QUOTE_CHARS);
    }

    if (!spansOverlap(mapped.start, mapped.end, intent.start, intent.end)) continue;

    const overlapStart = Math.max(mapped.start, intent.start);
    const overlapEnd = Math.min(mapped.end, intent.end);
    const score = overlapEnd >= overlapStart ? overlapEnd - overlapStart + 1 : 0;
    if (score > bestScore) {
      bestScore = score;
      best = mapped.text;
    }
  }

  return best ? truncateAtWordBoundary(best, MAX_QUOTE_CHARS) : null;
}

/**
 * Find a verbatim resume substring matching the model quote (exact, then normalized).
 * Prefers normalized matches that overlap the model's anchor/quote intent region.
 */
export function findVerbatimQuoteInResume(
  resumeText: string,
  quote: string,
  maxLen = MAX_QUOTE_CHARS,
  intentRegion?: { start: number; end: number } | null,
): string | null {
  const trimmed = quote.trim();
  if (!trimmed || trimmed === NO_DEFENSIBLE_QUOTE) return null;

  const rawIdx = resumeText.indexOf(trimmed);
  if (rawIdx >= 0) {
    const verbatim = resumeText.slice(rawIdx, rawIdx + trimmed.length);
    const end = rawIdx + verbatim.length - 1;
    if (!intentRegion || spansOverlap(rawIdx, end, intentRegion.start, intentRegion.end)) {
      return truncateAtWordBoundary(verbatim, maxLen);
    }
  }

  const nQuote = normalizeTextForMatch(trimmed);
  if (!nQuote) return null;

  const resolved = pickNormalizedMatch(resumeText, nQuote, intentRegion ?? null);
  if (resolved)
    return resolved.length > maxLen ? truncateAtWordBoundary(resolved, maxLen) : resolved;

  return null;
}

function pickAnchorCandidate(entry: EvidenceQuote): string | null {
  const anchor = entry.quote_anchor?.trim();
  if (anchor && anchor.length >= MIN_ANCHOR_CHARS) return anchor;
  const hint = entry.location_hint?.trim();
  if (hint && hint.length >= MIN_ANCHOR_CHARS && hint !== NO_DEFENSIBLE_QUOTE) return hint;
  return null;
}

function resolveQuoteEntry(entry: EvidenceQuote, resumeText: string): EvidenceQuote {
  const dimension = entry.dimension;
  let quote = entry.quote?.trim() ?? "";
  const locationHint = entry.location_hint?.trim() ?? "";
  const anchor = pickAnchorCandidate(entry);
  const intent = findIntentRegionInResume(resumeText, [entry.quote_anchor, quote, locationHint]);

  if (!quote || quote === NO_DEFENSIBLE_QUOTE) {
    return { ...entry, dimension, quote: NO_DEFENSIBLE_QUOTE, location_hint: locationHint };
  }

  let resolved =
    findVerbatimQuoteInResume(resumeText, quote, MAX_QUOTE_CHARS, intent) ??
    (anchor ? findVerbatimQuoteInResume(resumeText, anchor, MAX_QUOTE_CHARS, intent) : null);

  if (resolved) {
    return {
      ...entry,
      dimension,
      quote: resolved,
      location_hint: locationHint || entry.quote_anchor?.trim() || "",
    };
  }

  return { ...entry, dimension, quote, location_hint: locationHint };
}

/** Fill missing required dimensions with explicit NO_DEFENSIBLE_QUOTE (spec absence path). */
export function ensureRequiredQuoteEntries(
  evidence: HybridEvidenceJson,
  requiredDimensions: string[],
): HybridEvidenceJson {
  const byDimension = new Map(evidence.quotes.map((q) => [q.dimension, q]));
  const quotes = requiredDimensions.map((dimension) => {
    const existing = byDimension.get(dimension);
    if (existing) return existing;
    return {
      dimension,
      quote: NO_DEFENSIBLE_QUOTE,
      location_hint: "No quote entry returned by model",
    };
  });
  return { ...evidence, quotes };
}

/** Normalize quotes against resume text before strict validation. */
export function normalizeEvidenceQuotes(
  evidence: HybridEvidenceJson,
  resumeText: string,
  requiredDimensions: string[],
): HybridEvidenceJson {
  const filled = ensureRequiredQuoteEntries(evidence, requiredDimensions);
  return {
    ...filled,
    quotes: filled.quotes.map((entry) => resolveQuoteEntry(entry, resumeText)),
  };
}

export function validateEvidenceQuotes(
  evidence: HybridEvidenceJson,
  resumeText: string,
  requiredDimensions: string[],
): { ok: boolean; reason: string } {
  const byDimension = new Set(evidence.quotes.map((q) => q.dimension));
  for (const dim of requiredDimensions) {
    if (!byDimension.has(dim)) {
      return { ok: false, reason: `missing required dimension quote entry: ${dim}` };
    }
  }

  let totalQuotedChars = 0;
  for (const quote of evidence.quotes) {
    if (!quote.quote || quote.quote === NO_DEFENSIBLE_QUOTE) continue;
    if (quote.quote.length > MAX_QUOTE_CHARS) {
      return { ok: false, reason: `quote exceeds ${MAX_QUOTE_CHARS} chars for ${quote.dimension}` };
    }
    totalQuotedChars += quote.quote.length;
    const intent = findIntentRegionInResume(resumeText, [
      quote.quote_anchor,
      quote.quote,
      quote.location_hint,
    ]);
    if (!findVerbatimQuoteInResume(resumeText, quote.quote, MAX_QUOTE_CHARS, intent)) {
      return { ok: false, reason: `quote is not a resume substring for ${quote.dimension}` };
    }
  }
  if (totalQuotedChars > MAX_TOTAL_QUOTED_CHARS) {
    return { ok: false, reason: `total quoted content exceeds ${MAX_TOTAL_QUOTED_CHARS} chars` };
  }
  return { ok: true, reason: "ok" };
}

/**
 * Replace any quote that cannot be verified as a verbatim resume substring with
 * NO_DEFENSIBLE_QUOTE. Used on exhausted-retry fallback paths so hallucinated
 * quote text is never persisted or rendered as CV evidence.
 */
export function sanitizeUnverifiedQuotes(
  evidence: HybridEvidenceJson,
  resumeText: string,
): { evidence: HybridEvidenceJson; replacedDimensions: string[] } {
  const replacedDimensions: string[] = [];
  const quotes = evidence.quotes.map((entry) => {
    if (!entry.quote || entry.quote === NO_DEFENSIBLE_QUOTE) {
      return { ...entry, quote: NO_DEFENSIBLE_QUOTE };
    }
    const intent = findIntentRegionInResume(resumeText, [
      entry.quote_anchor,
      entry.quote,
      entry.location_hint,
    ]);
    if (findVerbatimQuoteInResume(resumeText, entry.quote, MAX_QUOTE_CHARS, intent)) {
      return entry;
    }
    replacedDimensions.push(entry.dimension);
    return {
      dimension: entry.dimension,
      quote: NO_DEFENSIBLE_QUOTE,
      location_hint:
        entry.location_hint?.trim() || "Quote could not be verified against the resume",
    };
  });
  return { evidence: { ...evidence, quotes }, replacedDimensions };
}

/**
 * Fill missing dimensions, resolve locators in code, then validate.
 * Use this at scoring boundaries instead of validateEvidenceQuotes alone.
 */
export function validateAndNormalizeEvidenceQuotes(
  evidence: HybridEvidenceJson,
  resumeText: string,
  requiredDimensions: string[],
): { ok: boolean; reason: string; evidence: HybridEvidenceJson } {
  const normalized = normalizeEvidenceQuotes(evidence, resumeText, requiredDimensions);
  const validity = validateEvidenceQuotes(normalized, resumeText, requiredDimensions);
  return { ...validity, evidence: normalized };
}

/**
 * Safe JSON parsing for hybrid extraction output (spec §3.4).
 */

import { logger } from "@/lib/observability/logger";

export type HybridJsonParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; rawSnippet?: string };

function stripMarkdownFences(text: string): string {
  let s = text.trim();
  const leading = /^```(?:json)?\s*\n?/i;
  if (leading.test(s)) s = s.replace(leading, "").trim();
  const trailing = /\n?```\s*[\s\S]*$/;
  if (trailing.test(s)) s = s.replace(trailing, "").trim();
  return s;
}

function replaceSmartQuotesAndControls(s: string): string {
  let out = s.replace(/\u201c|\u201d/g, '"').replace(/\u2018|\u2019/g, "'");
  out = out.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, " ");
  return out;
}

function tryParseObject(jsonStr: string): unknown {
  return JSON.parse(jsonStr);
}

/**
 * Parse LLM JSON with sanitization. On failure logs raw output snippet and returns structured error.
 */
export function parseHybridExtractionJson(
  raw: string,
): HybridJsonParseResult<Record<string, unknown>> {
  const snippet = (s: string) => (s.length > 2000 ? `${s.slice(0, 2000)}…` : s);

  const cleaned = replaceSmartQuotesAndControls(stripMarkdownFences(raw));

  try {
    const data = tryParseObject(cleaned);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return { ok: true, data: data as Record<string, unknown> };
    }
    return { ok: false, error: "Parsed JSON is not an object", rawSnippet: snippet(raw) };
  } catch {
    // fall through
  }

  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const data = tryParseObject(match[0]);
      if (data && typeof data === "object" && !Array.isArray(data)) {
        return { ok: true, data: data as Record<string, unknown> };
      }
    } catch {
      // continue
    }
  }

  logger.warn("[parseHybridExtractionJson] failed to parse extraction JSON", {
    rawLength: raw.length,
  });
  return {
    ok: false,
    error: "Could not parse extraction JSON after sanitization",
    rawSnippet: snippet(raw),
  };
}

/**
 * Best-effort parse of a malformed merged response — salvage extraction before JSON broke.
 */
export function tryParsePartialHybridExtraction(raw: string): {
  extraction: Record<string, unknown> | null;
  verdict: unknown | null;
} {
  const cleaned = replaceSmartQuotesAndControls(stripMarkdownFences(raw));

  const full = parseHybridExtractionJson(cleaned);
  if (full.ok) {
    const ext = full.data.extraction;
    return {
      extraction:
        ext && typeof ext === "object" && !Array.isArray(ext)
          ? (ext as Record<string, unknown>)
          : null,
      verdict: full.data.verdict ?? null,
    };
  }

  const extractionMatch = cleaned.match(/"extraction"\s*:\s*(\{[\s\S]*)/i);
  if (extractionMatch) {
    const fragment = extractionMatch[1];
    let depth = 0;
    let end = -1;
    for (let i = 0; i < fragment.length; i++) {
      if (fragment[i] === "{") depth += 1;
      else if (fragment[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end > 0) {
      try {
        const obj = JSON.parse(fragment.slice(0, end)) as Record<string, unknown>;
        if (obj && typeof obj === "object") {
          return { extraction: obj, verdict: null };
        }
      } catch {
        // continue
      }
    }
  }

  return { extraction: null, verdict: null };
}

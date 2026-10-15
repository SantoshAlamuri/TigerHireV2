import { flagsAreNearDuplicate } from "@/lib/fitscore/dedupe-flags";

export function toSentence(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function humanizeDisplayToken(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("_") || trimmed.includes("-")) {
    return toSentence(trimmed.replaceAll("-", "_"));
  }
  return trimmed;
}

/** First-seen casing wins; ignores case/whitespace-only duplicates (common across gap/red/ideal arrays). */
export function dedupeByNormalized(
  items: readonly (string | undefined | null)[],
  limit = 24,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const t = raw?.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * True when two recruiter-facing lines repeat the same gap/flag in different wording.
 * Delegates to the shared implementation in src/lib/fitscore/dedupe-flags.ts so the
 * persist-time safety net and this UI last-line-of-defence can never drift apart.
 */
export function linesAreNearDuplicateFlagLines(a: string, b: string): boolean {
  return flagsAreNearDuplicate(a, b);
}

/**
 * Collapses ideal/key/red gap lines that differ only by phrasing (model often emits two formulations).
 * First-seen wins (stable input order) so callers can put high-priority lines first — sorting by
 * length used to let terse ideal gaps push serious red flags past the display cap.
 */
export function dedupeNearDuplicateFlagLines(items: string[], limit = 14): string[] {
  const exact = dedupeByNormalized(items, Math.max(limit * 4, 32));
  const out: string[] = [];
  for (const cand of exact) {
    if (out.some((kept) => linesAreNearDuplicateFlagLines(cand, kept))) continue;
    out.push(cand);
    if (out.length >= limit) break;
  }
  return out;
}

const INSIGHT_WHY_SUBSTRING_MIN = 100;

/**
 * Amber “insight” strip often repeats the same blob as “Why this verdict” (one_line vs holistic).
 * Suppress the strip body when it would show twice.
 */
export function insightDuplicatesWhyVerdictBody(insight: string, why: string): boolean {
  const x = insight.trim().replace(/\s+/g, " ");
  const y = why.trim().replace(/\s+/g, " ");
  if (!x || !y) return false;
  if (x.toLowerCase() === y.toLowerCase()) return true;
  const xl = x.toLowerCase();
  const yl = y.toLowerCase();
  const shorter = xl.length <= yl.length ? xl : yl;
  const longer = xl.length <= yl.length ? yl : xl;
  if (shorter.length >= INSIGHT_WHY_SUBSTRING_MIN && longer.includes(shorter)) return true;
  return linesAreNearDuplicateFlagLines(x, y);
}

/**
 * Strip deterministic hybrid lead — keep model-written verdict body only (see hybrid
 * `buildVerdictLeadFromScores`). Gap bullets belong in Red flags, not here. When there is
 * no model body (deterministic-fallback rows), return null so the section hides instead of
 * repeating the score lead or ideal-profile gap list.
 */
export function shortenWhyVerdictForCustomer(fullText: string): string | null {
  const t = fullText.trim();
  if (!t) return null;
  const shortened = shortenWhyVerdictBody(t);
  if (shortened != null) return shortened;
  if (
    /^FitScore\s+\d+\s*\([^)]+\);\s*verdict:/i.test(t) ||
    /^Score\s+\d+\s*\([^)]+\),\s*driven by:/i.test(t)
  ) {
    return null;
  }
  return t;
}

/** True when "Why this verdict" text only restates gaps already listed under Red flags. */
export function whyVerdictIsRedundantWithGaps(why: string, gaps: readonly string[]): boolean {
  const w = why.trim();
  if (!w || gaps.length === 0) return false;

  const gapsLead = w.match(/^Key ideal-profile gaps:\s*([\s\S]+?)\.?$/i);
  if (gapsLead) {
    const segments = gapsLead[1]
      .split(/;\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (
      segments.length > 0 &&
      segments.every((seg) => gaps.some((g) => linesAreNearDuplicateFlagLines(seg, g)))
    ) {
      return true;
    }
  }

  if (/^No major ideal-profile gaps called out\.?$/i.test(w)) return true;
  if (gaps.some((g) => linesAreNearDuplicateFlagLines(w, g))) return true;
  return insightDuplicatesWhyVerdictBody(w, gaps.join("; "));
}

function shortenWhyVerdictBody(t: string): string | null {
  const blocks = t
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter(Boolean);
  const first = blocks[0] ?? "";
  const rest = blocks.slice(1).join("\n\n").trim();

  const richLead = /^FitScore\s+\d+\s*\([^)]+\);\s*verdict:/i.test(first);
  const basicLead = /^Score\s+\d+\s*\([^)]+\),\s*driven by:/i.test(first);

  if (richLead) {
    if (rest) return rest;
    return null;
  }

  if (basicLead) {
    if (!rest) return null;
    return rest;
  }

  return t;
}

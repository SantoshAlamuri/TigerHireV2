/**
 * Server-side de-duplication for FitScore flag lists (red/green/amber).
 *
 * Primary defence against duplicate flags is the extraction prompt's DISTINCTNESS rule
 * (src/lib/fitscore/hybrid/extraction.ts) — the model is told not to emit the same gap twice.
 * This is a conservative safety net applied before persist: it removes exact and clearly-reworded
 * duplicates without risking the merge of genuinely distinct flags (e.g. "No Spark" vs "No Hadoop").
 *
 * Note: token-overlap cannot catch every semantic duplicate that shares only one or two words;
 * those are prevented at the source by the prompt rule. Keep thresholds conservative here so a
 * real, distinct concern is never silently dropped.
 */

const FLAG_LINE_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "without",
  "not",
  "but",
  "has",
  "had",
  "have",
  "are",
  "was",
  "were",
  "this",
  "that",
  "any",
  "all",
  "its",
  "due",
  "via",
  "per",
  "can",
  "may",
  "from",
  "into",
  "over",
  "under",
  "across",
  "only",
  "also",
  "their",
  "there",
  "which",
  "when",
  "while",
  "been",
  "being",
  "does",
  "done",
  "more",
  "less",
  "than",
  "then",
  // generic recruiting filler — low signal for distinguishing one flag from another
  "exposure",
  "experience",
  "evidence",
  "evident",
  "mentioned",
  "mention",
  "resume",
  "candidate",
  "role",
  "roles",
  "listed",
  "skills",
  "skill",
  "detail",
  "details",
  "level",
  "project",
  "projects",
  "usage",
  "described",
  "anywhere",
  "generic",
  "generically",
  "despite",
  "context",
  "work",
  "background",
  "seen",
  "shown",
  "found",
  "recent",
  "explicit",
  "demonstrated",
  "hands",
  "entire",
  "career",
  "dedicated",
  "perspective",
]);

/**
 * Short (2-char) tokens the ≥3-char regex would drop but that carry the whole
 * meaning of a flag in recruiting copy. Without "qa", two rewordings of
 * "candidate is a developer, not a QA engineer" share almost no tokens.
 */
const SHORT_DOMAIN_TOKENS = new Set(["qa", "qc", "ci", "cd", "ui", "ux", "ai", "ml", "db", "bi"]);

/**
 * Domain synonyms canonicalised to one token so rewordings overlap:
 * "No QA or STLC experience" vs "not a quality-assurance engineer" both → qa.
 */
const TOKEN_CANONICAL: Record<string, string> = {
  stlc: "qa",
  sdet: "qa",
  assurance: "qa",
  quality: "qa",
  tester: "test",
};

/**
 * Light suffix stemming so "development"/"developer"/"developing" all → "develop".
 * Deliberately crude — consistency across a flag pair matters, linguistic purity doesn't.
 */
function stem(w: string): string {
  for (const suffix of ["ers", "er", "ing", "ments", "ment", "s"]) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 4) {
      return w.slice(0, w.length - suffix.length);
    }
  }
  return w;
}

/** Normalise common recruiting shorthand so topic tokens align across rewordings. */
function normalizeFlagText(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/\ba\s*\/\s*b\b/g, "abtest")
      // Multi-word phrases the model freely swaps for their acronym. Token overlap
      // cannot see that "Infrastructure-as-Code" IS "IaC", so two "No Terraform…"
      // lines shared only two tokens and survived dedupe as separate gaps (#392).
      .replace(/\binfrastructure[\s-]+as[\s-]+code\b/g, "iac")
      .replace(/\bcontinuous[\s-]+(integration|delivery|deployment)\b/g, "cicd")
      .replace(/\bci\s*\/\s*cd\b/g, "cicd")
      .replace(/\bmachine[\s-]+learning\b/g, "ml")
      .replace(/\bkubernetes\b/g, "k8s")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Alphanumeric tokens, lowercase, stopwords stripped, stemmed + canonicalised. */
function significantTokens(s: string): Set<string> {
  const lower = normalizeFlagText(s);
  const words = lower.match(/[a-z][a-z0-9]{2,}/g) ?? [];
  const shorts = (lower.match(/\b[a-z]{2}\b/g) ?? []).filter((w) => SHORT_DOMAIN_TOKENS.has(w));
  const out = new Set<string>();
  for (const w of [...words, ...shorts]) {
    if (FLAG_LINE_STOPWORDS.has(w)) continue;
    const canon = TOKEN_CANONICAL[w] ?? TOKEN_CANONICAL[stem(w)] ?? stem(w);
    out.add(canon);
  }
  return out;
}

function isEitherSubstringOfOther(a: string, b: string): boolean {
  const na = normalizeFlagText(a);
  const nb = normalizeFlagText(b);
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  return short.length >= 14 && long.includes(short);
}

/**
 * Broad-bucket tokens (mostly canonicalisation targets) that recur across many
 * *different* concerns — sharing only these is weak evidence of duplication.
 * "No Kafka + streaming" pairs are duplicates; "…QA…develop…" pairs may not be.
 */
const WEAK_TOKENS = new Set([
  "qa",
  "test",
  "develop",
  "software",
  "engine",
  "backend",
  "frontend",
  "data",
  "tool",
  "team",
]);

/**
 * Prefix negation/absence cues. Tokens following one of these (within the same clause)
 * are treated as "negated" for the direction-parity check below.
 */
const NEGATION_CUES = new Set([
  "no",
  "not",
  "without",
  "lacks",
  "lack",
  "lacking",
  "lacked",
  "missing",
  "never",
  "zero",
  "cannot",
]);

/**
 * Significant tokens that appear inside a negation scope ("lacks GCP…" → gcp).
 * Scope is conservative: it starts at a cue and ends at clause punctuation or a
 * contrast/conjunction word. Under-marking is safe — the parity check only blocks
 * a merge when negation is *swapped* between the two texts.
 */
function negatedSignificantTokens(s: string): Set<string> {
  const out = new Set<string>();
  const segments = s.toLowerCase().split(/[,;.!?():/–—]|\s[-‐]\s/);
  for (const seg of segments) {
    const words = seg.match(/[a-z][a-z0-9]*/g) ?? [];
    let negating = false;
    for (const w of words) {
      if (NEGATION_CUES.has(w)) {
        negating = true;
        continue;
      }
      if (w === "but" || w === "however" || w === "though" || w === "and" || w === "while") {
        negating = false;
        continue;
      }
      if (!negating) continue;
      if (FLAG_LINE_STOPWORDS.has(w)) continue;
      if (w.length < 3 && !SHORT_DOMAIN_TOKENS.has(w)) continue;
      const canon = TOKEN_CANONICAL[w] ?? TOKEN_CANONICAL[stem(w)] ?? stem(w);
      out.add(canon);
    }
  }
  return out;
}

/**
 * True when the two texts negate *opposite* content tokens — e.g.
 * "Has AWS but lacks GCP" vs "Has GCP but lacks AWS". Token-set overlap alone cannot
 * distinguish these (same tokens, swapped direction), so such pairs must never merge.
 * Requires a mismatch in BOTH directions (a true swap); a one-sided difference in
 * phrasing (one text negates, the other rewords) does not block a merge.
 */
function hasSwappedNegation(a: string, b: string, ta: Set<string>, tb: Set<string>): boolean {
  const na = negatedSignificantTokens(a);
  const nb = negatedSignificantTokens(b);
  let aNegatesWhatBAsserts = false;
  for (const t of na) {
    if (tb.has(t) && !nb.has(t)) {
      aNegatesWhatBAsserts = true;
      break;
    }
  }
  if (!aNegatesWhatBAsserts) return false;
  for (const t of nb) {
    if (ta.has(t) && !na.has(t)) return true;
  }
  return false;
}

/** True when two flag lines repeat the same gap/strength in different wording. */
export function flagsAreNearDuplicate(a: string, b: string): boolean {
  if (normalizeFlagText(a) === normalizeFlagText(b)) return true;
  if (isEitherSubstringOfOther(a, b)) return true;
  const ta = significantTokens(a);
  const tb = significantTokens(b);
  const minSz = Math.min(ta.size, tb.size);
  if (minSz < 2) return false;
  let inter = 0;
  let interSpecific = 0;
  for (const x of ta) {
    if (tb.has(x)) {
      inter++;
      if (!WEAK_TOKENS.has(x)) interSpecific++;
    }
  }
  // After stripping generic recruiting filler, two flags sharing most of their *distinctive*
  // tokens are the same concern reworded. Conservative thresholds avoid false merges.
  // Both similarity paths are trigger-happy on tiny token sets (2 shared tokens out of 3 is
  // jac 0.5 / overlap 0.67), so a 2-token intersection only counts when both shared tokens
  // are specific (e.g. kafka+streaming), not broad buckets (e.g. qa+test).
  const union = ta.size + tb.size - inter;
  const jac = union === 0 ? 0 : inter / union;
  const overlap = inter / minSz;
  // High specific-token overlap with moderate set overlap catches long paraphrases
  // (e.g. two A/B-testing statistical-rigor flags) without merging weak-token-only pairs.
  const similar =
    (jac >= 0.4 || overlap >= 0.6 || (interSpecific >= 3 && overlap >= 0.35)) &&
    (inter >= 3 || interSpecific >= 2);
  if (!similar) {
    // Two absence flags anchored on the same specific skills are one gap however the
    // rest is worded: "No Terraform or any IaC tooling mentioned anywhere on the resume"
    // vs "No Terraform or Infrastructure-as-Code tooling evident" share only
    // terraform+iac after filler is stripped, which token overlap alone scored too low.
    // Requiring TWO shared negated non-weak tokens keeps "No AWS certification" and
    // "No AWS production experience" apart — they share just one anchor (aws).
    return sharesNegatedAnchors(a, b) && !hasSwappedNegation(a, b, ta, tb);
  }
  // Directional flags share the same token set with opposite negation — never merge those.
  return !hasSwappedNegation(a, b, ta, tb);
}

/** True when both texts negate the same ≥2 specific (non-weak) tokens. */
function sharesNegatedAnchors(a: string, b: string): boolean {
  const na = negatedSignificantTokens(a);
  const nb = negatedSignificantTokens(b);
  let shared = 0;
  for (const t of na) {
    if (nb.has(t) && !WEAK_TOKENS.has(t)) shared++;
  }
  return shared >= 2;
}

/**
 * Collapse near-duplicate flag lines, keeping the first occurrence of each distinct concern.
 * Empty/whitespace lines are dropped. Order is preserved (first-seen wins).
 */
export function dedupeFlags(items: ReadonlyArray<string | null | undefined>, limit = 8): string[] {
  const out: string[] = [];
  for (const raw of items) {
    const cand = raw?.trim();
    if (!cand) continue;
    if (out.some((kept) => flagsAreNearDuplicate(cand, kept))) continue;
    out.push(cand);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Same as {@link dedupeFlags} but for objects carrying a `flag` text (e.g. red flags with
 * severity). Keeps the FIRST occurrence of each distinct concern — including its severity —
 * so deduping before scoring never inflates or reshuffles penalties.
 */
export function dedupeFlagObjects<T extends { flag: string }>(
  items: ReadonlyArray<T | null | undefined>,
  limit = 8,
): T[] {
  const out: T[] = [];
  const keptTexts: string[] = [];
  for (const item of items) {
    const cand = item?.flag?.trim();
    if (!cand) continue;
    if (keptTexts.some((kept) => flagsAreNearDuplicate(cand, kept))) continue;
    keptTexts.push(cand);
    out.push({ ...(item as T), flag: cand });
    if (out.length >= limit) break;
  }
  return out;
}

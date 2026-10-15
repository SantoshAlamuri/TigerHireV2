import { createHash } from "node:crypto";

/**
 * Normalize-then-hash for cascade verdict cache keys.
 *
 * Cosmetic differences (whitespace, punctuation, casing) MUST NOT bust the
 * cache or you pay for the same Claude verdict twice. Strip everything to
 * lowercase alphanumerics before hashing.
 *
 * Length-cap protects against pathological inputs (HTML resumes, 200KB JDs).
 */
const MAX_HASH_INPUT_CHARS = 200_000;

export function normalizeForHash(text: string): string {
  return text
    .slice(0, MAX_HASH_INPUT_CHARS)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function generateEntityHash(text: string): string {
  return createHash("sha256").update(normalizeForHash(text), "utf8").digest("hex");
}

/**
 * Pair hash for (candidate text, JD text). Order-stable so re-scoring the
 * same pair always lands on the same row.
 */
export function generatePairHash(candidateText: string, jdText: string): string {
  const candidateHash = generateEntityHash(candidateText);
  const jdHash = generateEntityHash(jdText);
  return createHash("sha256").update(`${candidateHash}:${jdHash}`, "utf8").digest("hex");
}

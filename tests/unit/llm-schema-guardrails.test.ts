import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Guardrail: LLM-output schemas must not use array-level `.catch(...)`.
 *
 * `z.array(elementSchema).catch([])` silently replaces the ENTIRE array when a
 * single element is malformed, while safeParse still reports success — this is
 * how a candidate with critical red flags rendered spotless (2026-07-06 audit).
 * Use element-level tolerance instead: z.preprocess that coerces/drops bad
 * elements individually (see coerceRedFlagArray in fitscore-hybrid.ts).
 *
 * If you genuinely need an array-level catch on a schema that does NOT parse
 * model output, add the file to the allowlist below with a comment saying why.
 */

const SCANNED_DIRS = ["src/lib/validations", "src/lib/fitscore", "src/lib/agents"];

const ALLOWLIST: string[] = [
  // "src/lib/validations/example.ts", // reason
];

// z.array(...).catch( — possibly with whitespace/newlines between chain links.
// Element-level tolerance wraps the array in z.preprocess(...), which this
// pattern intentionally does not match.
const ARRAY_CATCH_PATTERN =
  /z\s*\.\s*array\s*\([^)]*\)\s*(?:\.\s*\w+\s*\([^)]*\)\s*)*\.\s*catch\s*\(/g;

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collectTsFiles(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("LLM schema guardrails", () => {
  it("bans array-level .catch() in LLM-output schema directories", () => {
    const repoRoot = process.cwd();
    const offenders: string[] = [];

    for (const dir of SCANNED_DIRS) {
      for (const file of collectTsFiles(join(repoRoot, dir))) {
        const rel = file.slice(repoRoot.length + 1);
        if (ALLOWLIST.includes(rel)) continue;
        const source = readFileSync(file, "utf8");
        const matches = source.match(ARRAY_CATCH_PATTERN);
        if (matches) offenders.push(`${rel} (${matches.length} occurrence(s))`);
      }
    }

    expect(
      offenders,
      `Array-level .catch() wipes the whole array on one malformed element. ` +
        `Use element-level tolerance (z.preprocess coercion) instead. Offenders:\n` +
        offenders.join("\n"),
    ).toEqual([]);
  });
});

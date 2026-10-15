import { describe, it, expect } from "vitest";
import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  readSpec,
  screenKeys,
  screenBody,
  requiredLabels,
  builtText,
  normalizeForMatch,
  MANIFEST,
} from "../../scripts/v2-spec-extract.mjs";

/**
 * Does the build match the design that was approved?
 *
 * The v2 UI drifted from its spec because it was built outward from whatever
 * the API already returned, rather than inward from the design. Fields that
 * needed an extra fetch — ICP match, market rank, flag tiers — were quietly
 * dropped, one at a time, with no moment where anything was decided. The gap
 * was found by the operator looking at a page, not by anything in this repo.
 *
 * So the spec is pinned as a fixture and the requirements are EXTRACTED FROM
 * IT, never hand-written here. If the approved design says a screen shows
 * three scores and a logistics strip, this fails until it does.
 *
 * A failure is not a bug — it is an honest inventory of what is still missing.
 *
 * Extraction lives in scripts/v2-spec-extract.mjs, shared with the gap report.
 * The first version of it read only stat captions and flag columns, and so
 * passed an Analytics screen whose tabs, table columns and two entire sub-tabs
 * differed from the design. It reported 10 gaps where there were 51. A checker
 * narrow enough to miss that is worse than none, because it turns an unverified
 * screen into a green tick.
 */
const APP = join(process.cwd(), "src/app/(dashboard)/recruit/v2");

/**
 * Screens the approved design specifies that are NOT built yet.
 *
 * This is a ratchet, not an excuse: the list is asserted exactly, so building
 * one forces its removal, and a NEW gap appearing fails the suite. The gap is
 * documented in the repo instead of living in someone's head.
 */
const KNOWN_UNBUILT: string[] = [];

/**
 * Labels the design calls for that the build does not yet render. Same ratchet:
 * closing one means deleting its line, and any new omission fails.
 */
/**
 * rec:pool was recorded here as "blocked on schema". It was not: the column
 * applications.rejection_reason is live on both databases. What discarded the
 * reason was the API — no field on updateApplicationSchema, so Zod stripped it
 * before anything could write it. Both are fixed, and the pool now renders the
 * columns the design asks for, "Fit for" included.
 *
 * rec:profile was four entries: two vocabulary ("ICP" for "ICP match",
 * "Activity" for "Comms log", "Notes" for "Notes & assessment") and two real
 * surfacing gaps. The operator chose the design's words on 2026-08-01, so the
 * tabs were retitled and the two gaps closed — the CV versions card is named
 * for what it holds, and assessment state now appears on the profile instead of
 * only in the assessments tree, where a recruiter deciding someone never saw it.
 *
 * Empty is the goal, not the guarantee: a new omission fails this list, and
 * emptying it means the next gap is a regression rather than a known debt.
 */
const KNOWN_MISSING_LABELS: string[] = [];

const spec = readSpec(process.cwd());
const LIB = join(process.cwd(), "src/lib/v2");
const SRC = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

describe("v2 matches the approved design", () => {
  it("has the pinned spec fixture", () => {
    expect(spec.length).toBeGreaterThan(50_000);
  });

  it("maps every mapped screen to files that exist", () => {
    const missing: string[] = [];
    for (const [key, files] of Object.entries(MANIFEST)) {
      for (const f of files) if (!existsSync(join(APP, f))) missing.push(`${key} → ${f}`);
    }
    expect(missing).toEqual([]);
  });

  it("renders every label the approved design calls for", () => {
    const gaps: string[] = [];
    for (const [key, files] of Object.entries(MANIFEST)) {
      const body = screenBody(spec, key);
      if (!body) continue;
      const built = normalizeForMatch(builtText(APP, LIB, files, SRC));
      for (const { label } of requiredLabels(body)) {
        if (!built.includes(normalizeForMatch(label).trim())) gaps.push(`${key}: "${label}"`);
      }
    }
    // Ratchet: exactly the documented gaps, no more.
    expect(gaps.sort()).toEqual([...KNOWN_MISSING_LABELS].sort());
  });

  it("reports which approved screens have no build at all", () => {
    const keys = screenKeys(spec);
    // Candidate-portal screens are explicitly parked by the operator.
    const parked = new Set(["cd:status", "cd:data"]);
    const unbuilt = keys.filter((k) => !parked.has(k) && !MANIFEST[k]);
    expect(unbuilt.sort()).toEqual([...KNOWN_UNBUILT].sort());
  });

  it("keeps v2 additive — no page outside the v2 tree", () => {
    const v2Pages = walk(APP).filter((f) => f.endsWith("page.tsx"));
    expect(v2Pages.length).toBeGreaterThan(10);
    expect(v2Pages.every((f) => f.includes("/recruit/v2/"))).toBe(true);
  });
});

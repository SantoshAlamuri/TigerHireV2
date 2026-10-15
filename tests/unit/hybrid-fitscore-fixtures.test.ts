import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(__dirname, "../fixtures/hybrid-fitscore");

describe("hybrid-fitscore fixtures", () => {
  it("has JD sample and seven resume bodies (non-empty)", () => {
    const jd = join(FIXTURE_ROOT, "jd-scrum-master-sample.txt");
    expect(existsSync(jd)).toBe(true);
    expect(readFileSync(jd, "utf-8").trim().length).toBeGreaterThan(200);

    const names = [
      "shashank-garg",
      "bhavya-ps",
      "vijay-golla",
      "madhumita-goswami",
      "deepak-dc",
      "madhan-kumar",
      "moses-alhat",
    ];
    for (const n of names) {
      const p = join(FIXTURE_ROOT, "resumes", `${n}.txt`);
      expect(existsSync(p), p).toBe(true);
      expect(readFileSync(p, "utf-8").trim().length).toBeGreaterThan(20);
    }
  });

  it("parses validation-reference.json", () => {
    const p = join(FIXTURE_ROOT, "validation-reference.json");
    const j = JSON.parse(readFileSync(p, "utf-8")) as { tc01?: { minScore?: number } };
    expect(j.tc01?.minScore).toBe(60);
  });
});

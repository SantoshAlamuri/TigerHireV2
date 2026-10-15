import { describe, expect, it } from "vitest";
import { computeParseQualityScore, PARSE_QUALITY_THRESHOLD } from "./parse-quality";

describe("computeParseQualityScore", () => {
  it("returns a value in 0–1 for typical resume body", () => {
    const text = `
Experience
Software Engineer at Acme Corp 2020–2024
Led team of 5, built payment APIs.

Education
BS Computer Science

Skills
Python, TypeScript, AWS
    `.trim();
    const s = computeParseQualityScore(text);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
    expect(s).toBeGreaterThan(PARSE_QUALITY_THRESHOLD - 0.3);
  });

  it("scores very short noisy text lower", () => {
    const s = computeParseQualityScore("||| --- ");
    expect(s).toBeLessThan(0.5);
  });
});

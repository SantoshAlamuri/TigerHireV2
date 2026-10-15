import { describe, it, expect } from "vitest";
import {
  approvalLine,
  bands,
  clearRate,
  dimensionLabel,
  weightRows,
  weightsSumTo100,
} from "@/lib/v2/rubric-detail";

/** The shape real rows hold — machine-named keys, percentages summing to 100. */
const WEIGHTS = {
  test_automation: 25,
  test_strategy: 15,
  api_testing: 15,
  tools: 10,
  programming: 10,
  cicd_integration: 10,
  performance_testing: 10,
  years_exp: 5,
};

const THRESHOLDS = { weak: 25, moderate: 40, good: 60, strong: 78 };

describe("rubric weights", () => {
  it("humanises the stored keys", () => {
    expect(dimensionLabel("years_exp")).toBe("Years of experience");
    expect(dimensionLabel("cicd_integration")).toBe("CI/CD integration");
    expect(dimensionLabel("test_automation")).toBe("Test automation");
  });

  it("orders heaviest first", () => {
    const rows = weightRows(WEIGHTS);
    expect(rows[0].label).toBe("Test automation");
    expect(rows[rows.length - 1].label).toBe("Years of experience");
  });

  it("states each dimension's true share, not its raw number", () => {
    // A set edited one dimension at a time stops summing to 100. Printing the
    // raw weight as a percentage would then misstate what the score is made of.
    const lopsided = { outcomes: 60, skills: 60 };
    expect(weightsSumTo100(lopsided)).toBe(false);
    expect(weightRows(lopsided).map((r) => r.share)).toEqual([50, 50]);
  });

  it("says when the weights do add up", () => {
    expect(weightsSumTo100(WEIGHTS)).toBe(true);
    expect(weightRows(WEIGHTS)[0].share).toBe(25);
  });

  it("drops zero and non-numeric weights rather than rendering an empty row", () => {
    expect(weightRows({ a: 10, b: 0, c: Number.NaN }).map((r) => r.key)).toEqual(["a"]);
  });

  it("returns nothing for a rubric with no weights at all", () => {
    expect(weightRows(null)).toEqual([]);
    expect(weightRows({})).toEqual([]);
  });
});

describe("rubric bands", () => {
  it("derives the three bands from the stored thresholds", () => {
    expect(bands(THRESHOLDS)).toEqual([
      { label: "Clears", range: "≥ 78", meaning: "advance recommended", tone: "good" },
      {
        label: "Human judgement",
        range: "60–77",
        meaning: "a person decides, not the score",
        tone: "mid",
      },
      { label: "Below bar", range: "< 60", meaning: "Talent Pool, with a reason", tone: "low" },
    ]);
  });

  it("shows no bands rather than invented ones", () => {
    expect(bands(null)).toEqual([]);
    expect(bands({ weak: 25 })).toEqual([]);
  });
});

/**
 * A rubric nobody clears is a broken filter, not a high standard; one everybody
 * clears is not filtering. Both are invisible without this number.
 */
describe("clear rate", () => {
  it("counts those at or above the strong threshold", () => {
    expect(clearRate([80, 79, 78, 60, 40], THRESHOLDS)).toMatchObject({
      pct: 60,
      cleared: 3,
      scored: 5,
    });
  });

  it("calls 15–30% healthy, and says which way it is off outside that", () => {
    expect(clearRate([80, ...Array(4).fill(10)], THRESHOLDS).verdict).toBe("healthy"); // 20%
    expect(clearRate(Array(20).fill(10), THRESHOLDS).verdict).toBe("too tight"); // 0%
    expect(clearRate(Array(20).fill(90), THRESHOLDS).verdict).toBe("too loose"); // 100%
  });

  it("returns null rather than 0% when nothing has been scored", () => {
    // "0%" reads as "this rubric rejects everyone" — a claim about the bar
    // rather than the absence of data.
    expect(clearRate([], THRESHOLDS)).toEqual({
      pct: null,
      cleared: 0,
      scored: 0,
      verdict: null,
    });
    expect(clearRate([null, null], THRESHOLDS).pct).toBeNull();
  });

  it("returns null when the rubric has no threshold to clear", () => {
    expect(clearRate([80, 90], null).pct).toBeNull();
  });
});

describe("approval line", () => {
  it("names the approver and the date", () => {
    expect(approvalLine("A. Menon", "2026-07-12T09:00:00.000Z")).toEqual({
      text: "approved · A. Menon · 12 Jul",
      approved: true,
    });
  });

  it("does not present an unapproved rubric as approved by nobody", () => {
    expect(approvalLine(null, null)).toEqual({
      text: "not approved — scoring falls back to the generic bar",
      approved: false,
    });
  });

  it("still marks an approval whose approver name is missing", () => {
    // The approval is real; only the name lookup failed. Hiding it would
    // understate the governance state.
    expect(approvalLine(null, "2026-07-12T09:00:00.000Z")).toMatchObject({ approved: true });
  });
});

import { describe, it, expect } from "vitest";
import {
  buildScorecard,
  canSubmitVerdict,
  buildBrief,
  OFF_LIMITS,
  type BriefInput,
} from "@/lib/v2/hm-interview";

/**
 * The hiring manager's two screens.
 *
 * A scorecard's criteria come from the SAME approved rubric candidates were
 * scored against — otherwise the interview measures a different bar than the
 * screen did, and Quality-of-Hire becomes unanalysable.
 *
 * A brief exists to stop the panel re-asking what WhatsApp already answered,
 * and to keep compensation away from interviewers so rounds stay unbiased.
 */
describe("buildScorecard", () => {
  it("derives criteria from the rubric's must-haves", () => {
    const c = buildScorecard(["Distributed systems depth", "Data modelling"]);
    // Rubric criteria lead; Communication is appended by design (next test).
    expect(c.filter((x) => x.fromRubric).map((x) => x.name)).toEqual([
      "Distributed systems depth",
      "Data modelling",
    ]);
  });

  it("always includes communication, which no rubric lists but every panel judges", () => {
    const c = buildScorecard(["Distributed systems depth"]);
    expect(c.some((x) => /communication/i.test(x.name))).toBe(true);
  });

  it("falls back to a usable default when the rubric has no must-haves", () => {
    const c = buildScorecard([]);
    expect(c.length).toBeGreaterThan(0);
    // Never zero criteria — an empty scorecard collects nothing.
    expect(c.every((x) => x.name.trim().length > 0)).toBe(true);
  });

  it("gives every criterion an anchored scale, not a bare number", () => {
    for (const c of buildScorecard(["Data modelling"])) {
      expect(c.high.length).toBeGreaterThan(0);
      expect(c.low.length).toBeGreaterThan(0);
    }
  });

  it("ignores blank must-haves rather than rendering an unnamed row", () => {
    expect(buildScorecard(["Real", "  ", ""]).filter((c) => c.fromRubric)).toHaveLength(1);
  });

  it("caps criteria so a long rubric cannot produce an unfillable form", () => {
    const many = Array.from({ length: 20 }, (_, i) => `Must-have ${i}`);
    expect(buildScorecard(many).length).toBeLessThanOrEqual(6);
  });
});

describe("canSubmitVerdict", () => {
  it("refuses a verdict until every criterion is rated", () => {
    expect(canSubmitVerdict({ a: 3 }, 2).allowed).toBe(false);
    expect(canSubmitVerdict({ a: 3, b: 2 }, 2).allowed).toBe(true);
  });

  it("explains what is missing rather than just disabling the button", () => {
    const r = canSubmitVerdict({ a: 3 }, 3);
    expect(r.reason).toMatch(/2 of 3|rate/i);
  });

  it("does not count a zero as a rating — zero is unrated", () => {
    expect(canSubmitVerdict({ a: 0, b: 3 }, 2).allowed).toBe(false);
  });

  it("is refused when there are no criteria at all", () => {
    expect(canSubmitVerdict({}, 0).allowed).toBe(false);
  });
});

function brief(over: Partial<BriefInput> = {}): BriefInput {
  return { evidenceQuotes: [], mustHaves: [], amberFlags: [], ...over };
}

describe("buildBrief", () => {
  it("lists what the CV already evidences, with citations", () => {
    const b = buildBrief(
      brief({ evidenceQuotes: [{ quote: "Rebuilt allocation service", source: "CV · Swiggy" }] }),
    );
    expect(b.evidenced).toHaveLength(1);
    expect(b.evidenced[0].citation).toContain("Swiggy");
  });

  it("turns an unevidenced must-have into something to probe", () => {
    const b = buildBrief(
      brief({
        mustHaves: ["Postgres sharding at scale", "Kafka"],
        evidenceQuotes: [{ quote: "Ran Kafka at 40k msg/s", source: "CV" }],
      }),
    );
    const probes = b.probe.map((p) => p.text).join(" ");
    expect(probes).toContain("Postgres sharding");
    expect(probes).not.toContain("Kafka");
  });

  it("carries amber flags into the probe list — those are exactly the doubts", () => {
    const b = buildBrief(brief({ amberFlags: ["Team-lead title only 8 months"] }));
    expect(b.probe.some((p) => /8 months/.test(p.text))).toBe(true);
  });

  it("always marks compensation off-limits for the panel", () => {
    const b = buildBrief(brief());
    expect(b.offLimits).toContain(OFF_LIMITS.compensation);
    expect(b.offLimits.join(" ")).toMatch(/recruiter/i);
  });

  it("never leaks a compensation figure into the brief body", () => {
    const b = buildBrief(
      brief({ evidenceQuotes: [{ quote: "Expected CTC ₹38L", source: "screening" }] }),
    );
    const body = JSON.stringify([b.evidenced, b.probe]);
    expect(body).not.toContain("₹38L");
  });

  it("is safe with nothing on file", () => {
    const b = buildBrief(brief());
    expect(b.evidenced).toEqual([]);
    expect(b.probe).toEqual([]);
    expect(b.offLimits.length).toBeGreaterThan(0);
  });
});

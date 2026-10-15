import { describe, it, expect } from "vitest";
import {
  BENCHMARKS,
  targetLabel,
  resolveBenchmark,
  compareToTarget,
  compareToBenchmark,
  reqLoadVerdict,
} from "@/lib/v2/benchmarks";

/**
 * Benchmarks and org targets.
 *
 * Two rules. Every published figure carries a source, because an unattributed
 * number beside a real one reads as a target and cannot be defended. And an org's
 * own target overrides the published one while staying labelled as the org's —
 * presenting a customer's internal goal as an industry median would be worse
 * than showing neither.
 */
describe("published benchmarks", () => {
  it("attributes every figure", () => {
    for (const [key, b] of Object.entries(BENCHMARKS)) {
      expect(b.source.length, `${key} has no source`).toBeGreaterThan(10);
      expect(b.better === "lower" || b.better === "higher").toBe(true);
    }
  });

  it("knows that faster is better for time to fill and slower is not", () => {
    expect(BENCHMARKS.timeToFill.better).toBe("lower");
    expect(BENCHMARKS.offerAcceptance.better).toBe("higher");
  });
});

describe("resolveBenchmark", () => {
  it("falls back to the published figure when the org has set nothing", () => {
    const b = resolveBenchmark("timeToFill");
    expect(b?.value).toBe(45);
    expect(b?.isOrgTarget).toBe(false);
    expect(b?.source).toMatch(/SHRM/);
  });

  it("prefers the org's own target and says so", () => {
    const b = resolveBenchmark("timeToFill", { timeToFill: 30 });
    expect(b?.value).toBe(30);
    expect(b?.isOrgTarget).toBe(true);
    expect(b?.label).toMatch(/your target/i);
    expect(b?.source).toMatch(/your organisation/i);
  });

  it("reads as a plain target on the tile, never as somebody else's median", () => {
    // A tile is where a team looks at its own goal, so the badge is just the
    // target. Whether it is the seeded default or the org's own is surfaced on
    // the Benchmarks setup page, where it can actually be changed.
    expect(targetLabel(resolveBenchmark("timeToFill", { timeToFill: 30 })!, "d")).toBe(
      "target 30d",
    );
    expect(targetLabel(resolveBenchmark("timeToFill")!, "d")).toBe("target 45d");
    expect(targetLabel(resolveBenchmark("timeToFill")!, "d")).not.toMatch(/india|median|default/i);
  });

  it("keeps the better-direction of the metric when an org sets a target", () => {
    // Direction is a property of the metric. An org target of 30 days is still
    // "lower is better" — inheriting the wrong direction would invert the colour
    // and tell a fast team it is failing.
    expect(resolveBenchmark("timeToFill", { timeToFill: 30 })?.better).toBe("lower");
  });

  it("ignores a non-numeric or blank target rather than treating it as zero", () => {
    expect(resolveBenchmark("timeToFill", { timeToFill: null })?.value).toBe(45);
    expect(resolveBenchmark("timeToFill", { timeToFill: NaN })?.value).toBe(45);
  });

  it("returns null for a metric with no benchmark at all", () => {
    expect(resolveBenchmark("nonsense")).toBeNull();
  });
});

describe("compareToTarget", () => {
  it("reads a fast time to fill as good against the published median", () => {
    expect(compareToTarget(34, "timeToFill")).toBe("good");
  });

  it("flips the verdict when the org sets a tougher target", () => {
    // 34 days beats the 45-day industry median but misses a 25-day internal goal.
    expect(compareToTarget(34, "timeToFill", { timeToFill: 25 })).toBe("bad");
  });

  it("keeps a near-benchmark figure neutral rather than crying wolf", () => {
    expect(compareToTarget(44, "timeToFill")).toBe("warn");
  });

  it("is unknown when there is nothing to compare", () => {
    expect(compareToTarget(null, "timeToFill")).toBe("unknown");
    expect(compareToTarget(10, "nonsense")).toBe("unknown");
  });

  it("agrees with the published comparison when no target is set", () => {
    expect(compareToTarget(34, "timeToFill")).toBe(compareToBenchmark(34, "timeToFill"));
  });
});

describe("reqLoadVerdict", () => {
  it("calls an overloaded desk bad and a healthy one good", () => {
    expect(reqLoadVerdict(9)).toBe("bad");
    expect(reqLoadVerdict(5)).toBe("good");
  });

  it("flags an underloaded desk as worth a look, not as good", () => {
    expect(reqLoadVerdict(1)).toBe("warn");
  });
});

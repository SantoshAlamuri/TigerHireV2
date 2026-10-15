import { describe, it, expect } from "vitest";
import {
  SERIES,
  ORDINAL,
  STATUS,
  funnelIsMonotonic,
  barWidth,
  sparkPath,
  delta,
} from "@/lib/v2/viz";

/**
 * The visualisation tokens and the small amount of geometry that goes with them.
 *
 * The palettes themselves were validated by the data-viz validator against this
 * product's dark surface rather than by eye. What is pinned here is the part a
 * refactor can silently break: the fixed slot order, the reserved status set,
 * and the arithmetic that decides what a mark looks like.
 */
describe("palette tokens", () => {
  it("keeps the categorical order fixed, because colour follows the entity", () => {
    // Re-ordering these repaints every existing chart and breaks the promise
    // that a filter cannot change what colour a series is.
    expect(SERIES).toEqual(["#3987e5", "#d95926", "#199e70", "#c98500"]);
  });

  it("keeps status colours out of the categorical set", () => {
    for (const s of Object.values(STATUS)) expect(SERIES).not.toContain(s);
  });

  it("keeps the ordinal ramp a single hue, light to dark", () => {
    expect(ORDINAL).toHaveLength(5);
    expect(ORDINAL[0]).toBe("#cde2fb");
    expect(ORDINAL[ORDINAL.length - 1]).toBe("#256abf");
  });
});

describe("funnelIsMonotonic", () => {
  it("accepts a funnel that narrows", () => {
    expect(funnelIsMonotonic([312, 84, 18, 6, 1])).toBe(true);
  });

  it("accepts equal adjacent stages", () => {
    expect(funnelIsMonotonic([10, 10, 4])).toBe(true);
  });

  it("rejects a funnel that widens, which means the stages were counted differently", () => {
    expect(funnelIsMonotonic([100, 20, 40])).toBe(false);
  });

  it("treats a single stage as valid", () => {
    expect(funnelIsMonotonic([5])).toBe(true);
  });
});

describe("barWidth", () => {
  it("scales against the widest value", () => {
    expect(barWidth(50, 100)).toBe(50);
  });

  it("keeps a tiny non-zero value visible instead of rounding it away", () => {
    // A single applicant against a 500-applicant job rounds to 0% and vanishes,
    // which reads as "none" rather than "one".
    expect(barWidth(1, 500)).toBeGreaterThan(0);
  });

  it("draws nothing for zero", () => {
    expect(barWidth(0, 100)).toBe(0);
  });

  it("does not divide by a zero maximum", () => {
    expect(barWidth(5, 0)).toBe(0);
  });
});

describe("sparkPath", () => {
  it("draws a path across the full width", () => {
    const p = sparkPath([1, 5, 3]);
    expect(p.startsWith("M0.0,")).toBe(true);
    expect(p).toContain("L100.0,");
  });

  it("draws a flat series on the centre line, not along the floor", () => {
    // A run of identical values has no variance; pinning it to the bottom of the
    // box would read as a collapse to zero.
    const p = sparkPath([4, 4, 4]);
    expect(p).toContain("12");
  });

  it("returns nothing for a series too short to have a shape", () => {
    expect(sparkPath([7])).toBe("");
    expect(sparkPath([])).toBe("");
  });
});

describe("delta", () => {
  it("computes period-over-period change", () => {
    expect(delta(120, 100)).toBe(20);
    expect(delta(80, 100)).toBe(-20);
  });

  it("refuses a percentage against a base of zero", () => {
    expect(delta(50, 0)).toBeNull();
  });

  it("refuses a comparison when either figure is missing", () => {
    expect(delta(null, 100)).toBeNull();
    expect(delta(100, null)).toBeNull();
  });
});

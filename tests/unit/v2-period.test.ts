import { describe, it, expect } from "vitest";
import { PERIODS, resolvePeriod, resolveCustomPeriod, withinPeriod } from "@/lib/v2/period";

/**
 * Date ranges for analytics.
 *
 * Every number on the analytics screen was computed over "whatever the last 100
 * applications happened to be". "Time to fill: 64 days" with no period attached
 * cannot be checked, compared, or quoted — and it is exactly the kind of figure
 * that ends up in a board deck.
 *
 * The financial year here is April to March. An India-first product that reports
 * "FY" on a January boundary is reporting the wrong year to everyone using it,
 * and the error is invisible because the number still looks plausible.
 */
const at = (iso: string) => Date.parse(iso);

describe("resolvePeriod", () => {
  it("offers the ranges a talent leader actually reports on", () => {
    const keys = PERIODS.map((p) => p.key);
    expect(keys).toEqual([
      "this_month",
      "last_month",
      "this_quarter",
      "last_quarter",
      "this_year",
      "this_fy",
      "last_fy",
      "rolling_12",
      "all_time",
      "custom",
    ]);
  });

  it("resolves this month from the first of the month", () => {
    const p = resolvePeriod("this_month", at("2026-07-30T10:00:00Z"));
    expect(p.start).toBe(at("2026-07-01T00:00:00Z"));
    expect(p.label).toMatch(/jul 2026/i);
  });

  it("resolves last month without leaking into this one", () => {
    const p = resolvePeriod("last_month", at("2026-07-30T10:00:00Z"));
    expect(p.start).toBe(at("2026-06-01T00:00:00Z"));
    expect(p.end).toBe(at("2026-07-01T00:00:00Z"));
  });

  it("rolls a January last-month back to the previous December", () => {
    const p = resolvePeriod("last_month", at("2026-01-15T00:00:00Z"));
    expect(p.start).toBe(at("2025-12-01T00:00:00Z"));
  });

  it("resolves calendar quarters, not rolling 90-day windows", () => {
    const p = resolvePeriod("this_quarter", at("2026-07-30T00:00:00Z"));
    expect(p.start).toBe(at("2026-07-01T00:00:00Z"));
    expect(p.end).toBe(at("2026-10-01T00:00:00Z"));
  });

  it("resolves last quarter across a year boundary", () => {
    const p = resolvePeriod("last_quarter", at("2026-02-10T00:00:00Z"));
    expect(p.start).toBe(at("2025-10-01T00:00:00Z"));
    expect(p.end).toBe(at("2026-01-01T00:00:00Z"));
  });

  it("treats the financial year as April to March", () => {
    const p = resolvePeriod("this_fy", at("2026-07-30T00:00:00Z"));
    expect(p.start).toBe(at("2026-04-01T00:00:00Z"));
    expect(p.end).toBe(at("2027-04-01T00:00:00Z"));
    expect(p.label).toMatch(/FY 2026–27/);
  });

  it("puts a January date in the financial year that began the previous April", () => {
    // The trap: January 2026 belongs to FY 2025-26, not FY 2026-27. Getting this
    // wrong reports a quarter of the year's hiring against the wrong year.
    const p = resolvePeriod("this_fy", at("2026-01-15T00:00:00Z"));
    expect(p.start).toBe(at("2025-04-01T00:00:00Z"));
    expect(p.label).toMatch(/FY 2025–26/);
  });

  it("resolves last financial year", () => {
    const p = resolvePeriod("last_fy", at("2026-07-30T00:00:00Z"));
    expect(p.start).toBe(at("2025-04-01T00:00:00Z"));
    expect(p.end).toBe(at("2026-04-01T00:00:00Z"));
    expect(p.label).toMatch(/FY 2025–26/);
  });

  it("resolves the calendar year separately from the financial year", () => {
    const p = resolvePeriod("this_year", at("2026-07-30T00:00:00Z"));
    expect(p.start).toBe(at("2026-01-01T00:00:00Z"));
    expect(p.label).toBe("2026");
  });

  it("rolls twelve months back from today, not to the start of the month", () => {
    const p = resolvePeriod("rolling_12", at("2026-07-30T00:00:00Z"));
    expect(p.start).toBe(at("2025-07-30T00:00:00Z"));
  });

  it("leaves all time unbounded rather than picking an arbitrary epoch", () => {
    const p = resolvePeriod("all_time", at("2026-07-30T00:00:00Z"));
    expect(p.start).toBeNull();
    expect(p.label).toMatch(/all time/i);
  });

  it("falls back to all time on an unrecognised key rather than throwing", () => {
    expect(resolvePeriod("nonsense", at("2026-07-30T00:00:00Z")).key).toBe("all_time");
  });
});

describe("withinPeriod", () => {
  const p = resolvePeriod("this_month", at("2026-07-30T00:00:00Z"));

  it("includes a date inside the window", () => {
    expect(withinPeriod("2026-07-04T09:00:00Z", p)).toBe(true);
  });

  it("excludes a date before the window", () => {
    expect(withinPeriod("2026-06-30T23:59:00Z", p)).toBe(false);
  });

  it("excludes the exact end instant, so adjacent periods cannot double-count", () => {
    expect(withinPeriod(new Date(p.end).toISOString(), p)).toBe(false);
  });

  it("excludes a row with no date rather than silently counting it", () => {
    expect(withinPeriod(null, p)).toBe(false);
    expect(withinPeriod("nonsense", p)).toBe(false);
  });

  it("accepts everything, including undated rows, for all time", () => {
    const all = resolvePeriod("all_time", at("2026-07-30T00:00:00Z"));
    expect(withinPeriod("2019-01-01T00:00:00Z", all)).toBe(true);
    expect(withinPeriod(null, all)).toBe(true);
  });
});

describe("resolveCustomPeriod", () => {
  const now = Date.parse("2026-07-30T00:00:00Z");

  it("includes the whole of the chosen end day", () => {
    // Picking 1–31 Jul and silently excluding the 31st is the classic
    // off-by-one that makes a month look quieter than it was.
    const p = resolveCustomPeriod("2026-07-01", "2026-07-31", now);
    expect(withinPeriod("2026-07-31T18:00:00Z", p)).toBe(true);
    expect(withinPeriod("2026-08-01T00:00:00Z", p)).toBe(false);
  });

  it("falls back to all time on a reversed range rather than showing nothing", () => {
    expect(resolveCustomPeriod("2026-07-31", "2026-07-01", now).key).toBe("all_time");
  });

  it("falls back to all time on unparseable input", () => {
    expect(resolveCustomPeriod("not-a-date", "2026-07-01", now).key).toBe("all_time");
  });

  it("labels the range it actually applied", () => {
    expect(resolveCustomPeriod("2026-04-01", "2026-06-30", now).label).toBe(
      "2026-04-01 to 2026-06-30",
    );
  });
});

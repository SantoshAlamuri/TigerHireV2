import { describe, it, expect } from "vitest";
import { filterOptions, applyFilters } from "@/lib/v2/candidate-filters";

/**
 * Function and location filters, and the intent signal.
 *
 * v1's candidate list is 493 lines and v2's is 237. Roughly half that difference
 * is capability, not savings: filter-by-function, filter-by-location, the intent
 * signal and the no-results state have no v2 equivalent. A recruiter who filters
 * by location today would open the new page and find no way to do it, which is a
 * downgrade wearing a redesign.
 */
const row = (over = {}) => ({
  jobTitle: "Backend Engineer",
  location: "Bangalore",
  intentScore: 70,
  ...over,
});

describe("filterOptions", () => {
  it("offers each function and location once, sorted, from the data present", () => {
    const o = filterOptions([
      row(),
      row({ jobTitle: "Backend Engineer", location: "Pune" }),
      row({ jobTitle: "Data Analyst", location: "Bangalore" }),
    ]);
    expect(o.functions).toEqual(["Backend Engineer", "Data Analyst"]);
    expect(o.locations).toEqual(["Bangalore", "Pune"]);
  });

  it("ignores blanks rather than offering an empty filter chip", () => {
    const o = filterOptions([
      row({ location: "  " }),
      row({ location: null }),
      row({ jobTitle: "" }),
    ]);
    expect(o.locations).not.toContain("");
    expect(o.functions).not.toContain("");
  });
});

describe("applyFilters", () => {
  const rows = [
    row({ jobTitle: "Backend Engineer", location: "Bangalore", intentScore: 90 }),
    row({ jobTitle: "Data Analyst", location: "Pune", intentScore: 20 }),
    row({ jobTitle: "Backend Engineer", location: "Pune", intentScore: null }),
  ];

  it("returns everything when no filter is set", () => {
    expect(applyFilters(rows, {}).length).toBe(3);
  });

  it("filters by function", () => {
    expect(applyFilters(rows, { fn: "Data Analyst" }).length).toBe(1);
  });

  it("filters by location", () => {
    expect(applyFilters(rows, { location: "Pune" }).length).toBe(2);
  });

  it("combines filters as AND, not OR", () => {
    // OR would quietly widen the list and look like the filter had not applied.
    expect(applyFilters(rows, { fn: "Backend Engineer", location: "Pune" }).length).toBe(1);
  });

  it("keeps only high-intent candidates when the signal is on", () => {
    expect(applyFilters(rows, { highIntentOnly: true }).map((r) => r.intentScore)).toEqual([90]);
  });

  it("excludes unscored candidates from a high-intent filter rather than assuming", () => {
    // A null intent score is unknown, not low and not high. Including it would
    // pad a "high intent" list with people nobody has measured.
    expect(applyFilters(rows, { highIntentOnly: true }).some((r) => r.intentScore === null)).toBe(
      false,
    );
  });

  it("returns an empty list rather than falling back to everything", () => {
    expect(applyFilters(rows, { location: "Nowhere" })).toEqual([]);
  });
});

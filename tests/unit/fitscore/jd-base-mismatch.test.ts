import { describe, expect, it } from "vitest";
import {
  buildReviewRows,
  detectJdBaseMismatches,
} from "@/lib/fitscore/jd-base-approval/mismatch-detection";
import {
  parseYearsRange,
  roleLevelFromYearsRange,
} from "@/lib/fitscore/jd-base-approval/years-range";

describe("jd-base mismatch detection", () => {
  const jd = `
QA Engineer
2-4 years hands-on QA experience required.
API testing with Postman is essential.
Test automation (Selenium/Playwright) is preferred, not required.
`;

  it("flags senior ideal years vs junior JD range", () => {
    const mismatches = detectJdBaseMismatches({
      jobDescriptionText: jd,
      jobTitle: "QA Engineer",
      idealProfile: {
        summary: "Senior QA",
        must_haves: ["5+ years automation"],
        nice_to_haves: [],
        years_range: "5-12 years",
        benchmarks: {},
      },
      weights: { test_automation: 8, api_testing: 25 },
    });
    expect(mismatches.some((m) => m.id === "years_senior_ideal_vs_junior_jd")).toBe(true);
  });

  it("flags junior title with senior years_range", () => {
    const mismatches = detectJdBaseMismatches({
      jobDescriptionText: jd,
      jobTitle: "Junior QA Engineer",
      idealProfile: {
        summary: "x",
        must_haves: [],
        nice_to_haves: [],
        years_range: "5-8 years",
        benchmarks: {},
      },
      weights: {},
    });
    expect(mismatches.some((m) => m.id === "title_junior_vs_senior_ideal")).toBe(true);
  });

  it("flags scoring years floor below the JD's minimum", () => {
    const mismatches = detectJdBaseMismatches({
      jobDescriptionText: "Lead Business Analyst. 6-10 years experience required. Strong SQL.",
      jobTitle: "Lead Business Analyst",
      idealProfile: {
        summary: "x",
        must_haves: [],
        nice_to_haves: [],
        years_range: "5-10 years",
        benchmarks: {},
      },
      weights: {},
    });
    expect(mismatches.some((m) => m.id === "years_ideal_min_below_jd")).toBe(true);
  });

  it("flags a high-weight non-catalog dimension missing from the JD", () => {
    const mismatches = detectJdBaseMismatches({
      jobDescriptionText: "Lead Business Analyst. 6-10 years experience. Strong SQL and Excel.",
      jobTitle: "Lead Business Analyst",
      idealProfile: null,
      weights: { stakeholder_management: 30 },
    });
    expect(mismatches.some((m) => m.id === "weight_high_unmentioned_stakeholder_management")).toBe(
      true,
    );
  });

  it("does not treat 'interested' as a REST/API mention", () => {
    const mismatches = detectJdBaseMismatches({
      jobDescriptionText:
        "Business Analyst. Interested candidates should apply. Restructuring experience a plus.",
      jobTitle: "Business Analyst",
      idealProfile: null,
      weights: { api_testing: 25 },
    });
    expect(mismatches.some((m) => m.id === "weight_high_unmentioned_api_testing")).toBe(true);
  });
});

describe("buildReviewRows", () => {
  const baJd = `
Lead Business Analyst
6-10 years experience required.
Strong SQL and requirements gathering. Works closely with stakeholders.
`;

  it("builds rows from the job's actual weights, not hardcoded QA dimensions", () => {
    const rows = buildReviewRows({
      jobDescriptionText: baJd,
      idealProfile: {
        summary: "x",
        must_haves: [],
        nice_to_haves: [],
        years_range: "6-10 years",
        benchmarks: {},
      },
      weights: { requirements_gathering: 30, sql: 25, stakeholder_management: 15 },
    });
    const scoringLabels = rows.map((r) => r.scoringLabel);
    expect(scoringLabels).toContain("requirements_gathering: 30%");
    expect(scoringLabels).toContain("sql: 25%");
    expect(scoringLabels.some((l) => l.startsWith("test_automation"))).toBe(false);
    expect(scoringLabels.some((l) => l.startsWith("api_testing"))).toBe(false);
  });

  it("quotes the JD when the dimension is mentioned", () => {
    const rows = buildReviewRows({
      jobDescriptionText: baJd,
      idealProfile: null,
      weights: { sql: 25 },
    });
    const sqlRow = rows.find((r) => r.scoringLabel === "sql: 25%");
    expect(sqlRow?.ok).toBe(true);
    expect(sqlRow?.jdLabel).toContain("SQL");
    expect(sqlRow?.jdLabel).not.toContain("(see JD)");
  });

  it("marks the years row not-ok when scoring floor is below the JD minimum", () => {
    const rows = buildReviewRows({
      jobDescriptionText: baJd,
      idealProfile: {
        summary: "x",
        must_haves: [],
        nice_to_haves: [],
        years_range: "5-10 years",
        benchmarks: {},
      },
      weights: {},
    });
    const yearsRow = rows[0];
    expect(yearsRow.jdLabel).toBe("6-10 years experience");
    expect(yearsRow.scoringLabel).toBe("years_range: 5-10 years");
    expect(yearsRow.ok).toBe(false);
  });

  it("keeps the years row ok when scoring matches the JD range", () => {
    const rows = buildReviewRows({
      jobDescriptionText: baJd,
      idealProfile: {
        summary: "x",
        must_haves: [],
        nice_to_haves: [],
        years_range: "6-10 years",
        benchmarks: {},
      },
      weights: {},
    });
    expect(rows[0].ok).toBe(true);
  });

  it("marks a high-weight dimension not-ok when the JD never mentions it", () => {
    const rows = buildReviewRows({
      jobDescriptionText: baJd,
      idealProfile: null,
      weights: { test_automation: 30 },
    });
    const row = rows.find((r) => r.scoringLabel === "test_automation: 30%");
    expect(row?.ok).toBe(false);
    expect(row?.jdLabel).toContain("not clearly stated in JD");
  });
});

describe("years-range helpers", () => {
  it("parses 2-4 years", () => {
    expect(parseYearsRange("2-4 years")).toEqual({ min: 2, max: 4 });
  });

  it("infers mid from 2-4 range", () => {
    expect(roleLevelFromYearsRange("2-4 years")).toBe("mid");
  });
});

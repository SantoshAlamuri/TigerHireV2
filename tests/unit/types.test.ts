import { describe, it, expect } from "vitest";
import {
  getFitScoreRating,
  getFitScoreColor,
  getFitScoreBgColor,
  getIntentColor,
  ROLE_LABELS,
  ROLE_DASHBOARD_PATH,
} from "@/types";

describe("getFitScoreRating", () => {
  it("returns Strong Match for scores >= 90", () => {
    expect(getFitScoreRating(90)).toBe("Strong Match");
    expect(getFitScoreRating(100)).toBe("Strong Match");
    expect(getFitScoreRating(95)).toBe("Strong Match");
  });

  it("returns Good Match for scores 75-89", () => {
    expect(getFitScoreRating(75)).toBe("Good Match");
    expect(getFitScoreRating(89)).toBe("Good Match");
  });

  it("returns Moderate for scores 60-74", () => {
    expect(getFitScoreRating(60)).toBe("Moderate");
    expect(getFitScoreRating(74)).toBe("Moderate");
  });

  it("returns Weak for scores < 60", () => {
    expect(getFitScoreRating(59)).toBe("Weak");
    expect(getFitScoreRating(0)).toBe("Weak");
    expect(getFitScoreRating(-1)).toBe("Weak");
  });
});

// FitScore + intent colours now route through the single score-tone ramp
// (src/lib/score-tone.ts): one set of thresholds (80/60/40) and the --score-*
// token palette, so the same value reads the same colour everywhere (audit F-03).
describe("getFitScoreColor", () => {
  it("returns the strong tone for scores >= 80", () => {
    expect(getFitScoreColor(80)).toBe("text-[color:var(--score-strong)]");
    expect(getFitScoreColor(100)).toBe("text-[color:var(--score-strong)]");
  });

  it("returns the good tone for scores 60-79", () => {
    expect(getFitScoreColor(60)).toBe("text-[color:var(--score-good)]");
    expect(getFitScoreColor(79)).toBe("text-[color:var(--score-good)]");
  });

  it("returns the fair tone for scores 40-59", () => {
    expect(getFitScoreColor(40)).toBe("text-[color:var(--score-fair)]");
    expect(getFitScoreColor(59)).toBe("text-[color:var(--score-fair)]");
  });

  it("returns the weak tone for scores < 40", () => {
    expect(getFitScoreColor(39)).toBe("text-[color:var(--score-weak)]");
    expect(getFitScoreColor(0)).toBe("text-[color:var(--score-weak)]");
  });
});

describe("getFitScoreBgColor", () => {
  it("returns the matching score-tone background classes", () => {
    expect(getFitScoreBgColor(90)).toBe("bg-[color:var(--score-strong-bg)]");
    expect(getFitScoreBgColor(70)).toBe("bg-[color:var(--score-good-bg)]");
    expect(getFitScoreBgColor(45)).toBe("bg-[color:var(--score-fair-bg)]");
    expect(getFitScoreBgColor(20)).toBe("bg-[color:var(--score-weak-bg)]");
  });
});

describe("getIntentColor", () => {
  it("shares the same ramp as FitScore", () => {
    expect(getIntentColor(80)).toBe("text-[color:var(--score-strong)]");
    expect(getIntentColor(60)).toBe("text-[color:var(--score-good)]");
    expect(getIntentColor(40)).toBe("text-[color:var(--score-fair)]");
    expect(getIntentColor(20)).toBe("text-[color:var(--score-weak)]");
    expect(getIntentColor(0)).toBe("text-[color:var(--score-weak)]");
  });
});

describe("ROLE_LABELS", () => {
  it("has a label for every role", () => {
    const roles = [
      "super_admin",
      "leadership",
      "recruiter",
      "agency",
      "candidate_pro",
      "candidate_free",
    ] as const;
    for (const role of roles) {
      expect(ROLE_LABELS[role]).toBeDefined();
      expect(typeof ROLE_LABELS[role]).toBe("string");
    }
  });
});

describe("ROLE_DASHBOARD_PATH", () => {
  it("lands the three hiring seats on their own work, not a tile grid", () => {
    // Every recruiter tile — applications today, open jobs, stale pipeline —
    // is now a column on the Jobs list with a blocker attached, and
    // leadership's are the Portfolio. Hiring managers land on owned jobs, where
    // approvals and candidate work are scoped to their actual responsibility.
    expect(ROLE_DASHBOARD_PATH.recruiter).toBe("/recruit/jobs");
    expect(ROLE_DASHBOARD_PATH.hiring_manager).toBe("/company/my-jobs");
    expect(ROLE_DASHBOARD_PATH.leadership).toBe("/company");
  });

  it("keeps /home for the seats the redesign never covered", () => {
    // The approved design covers five seats; interviewer and finance are not
    // among them, so nothing replaced their tiles. Dropping /home for everyone
    // would leave these two with a single nav item and nowhere to start.
    expect(ROLE_DASHBOARD_PATH.interviewer).toBe("/home");
    expect(ROLE_DASHBOARD_PATH.finance).toBe("/home");
  });

  it("maps every other role to a path", () => {
    expect(ROLE_DASHBOARD_PATH.super_admin).toBe("/admin");
    expect(ROLE_DASHBOARD_PATH.employee).toBe("/employee");
    expect(ROLE_DASHBOARD_PATH.agency).toBe("/agency");
    expect(ROLE_DASHBOARD_PATH.candidate_pro).toBe("/candidate");
    expect(ROLE_DASHBOARD_PATH.candidate_free).toBe("/candidate");
  });
});

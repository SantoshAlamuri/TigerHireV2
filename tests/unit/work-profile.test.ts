import { describe, expect, it } from "vitest";
import {
  draftFromJdBase,
  profileProblems,
  rankingSpread,
  readPay,
  saveBody,
  withLevel,
} from "@/lib/work/profile";

const icp = {
  summary: "QA lead who owns automation",
  must_haves: ["Selenium", "TestNG", "selenium"],
  nice_to_haves: ["JMeter"],
  years_range: "5-8 years",
  benchmarks: { certifications: "ISTQB", scale: "10M users" },
  outcomes: ["Cut regression time in half"],
  competencies: ["Owns quality end to end"],
  traits: ["Curious"],
  background_preferences: ["Product company"],
};

describe("ideal candidate draft", () => {
  it("reads every field, de-duplicating case-insensitively", () => {
    const d = draftFromJdBase(icp, { need_to_haves: ["API testing"] }, "");
    expect(d.level).toBe("senior");
    expect([d.yearsMin, d.yearsMax]).toEqual([5, 8]);
    expect(d.must).toEqual(["Selenium", "TestNG"]);
    expect(d.should).toEqual(["API testing"]);
    expect(d.outcomes).toEqual(["Cut regression time in half"]);
  });

  it("round-trips without losing benchmarks or responsibilities", () => {
    const d = draftFromJdBase(icp, { responsibilities: ["Own the suite"] }, "");
    const body = saveBody(
      "j1",
      { ...d, should: ["API testing"] },
      {
        icp,
        structured: { responsibilities: ["Own the suite"], role_basics: { location: "Pune" } },
        title: "QA Lead",
      },
    );
    expect(body.idealCandidateProfile.benchmarks.scale).toBe("10M users");
    expect(body.idealCandidateProfile.outcomes).toEqual(["Cut regression time in half"]);
    expect(body.idealCandidateProfile.competencies).toEqual(["Owns quality end to end"]);
    expect(body.structuredJd.need_to_haves).toEqual(["API testing"]);
    expect(body.structuredJd.responsibilities).toEqual(["Own the suite"]);
    expect(body.structuredJd.role_basics).toEqual({ location: "Pune", title: "QA Lead" });
    expect(body.idealCandidateProfile.years_range).toBe("5-8 years");
  });

  it("moves years with the level and needs a must-have", () => {
    const d = withLevel(draftFromJdBase(null, null, ""), "junior");
    expect([d.yearsMin, d.yearsMax]).toEqual([0, 2]);
    expect(profileProblems(d)).toContain("Add at least one must-have.");
  });
});

describe("market", () => {
  const bands = [
    { label: "IC2", min_amount: 600_000, max_amount: 1_000_000, currency: "INR" },
    { label: "IC3", min_amount: 1_200_000, max_amount: 2_200_000, currency: "INR" },
  ];

  it("places the range against the closest band", () => {
    expect(readPay({ min: 1_300_000, max: 2_000_000 }, bands, []).bandFit).toBe("inside");
    const r = readPay({ min: 900_000, max: 1_200_000 }, bands, []);
    expect(r.band?.label).toBe("IC2");
    expect(r.bandFit).toBe("overlaps");
  });

  it("reads what applicants ask for", () => {
    const r = readPay({ min: 900_000, max: 1_200_000 }, [], [8, 10, 12, 15, null, 0, 20]);
    expect(r.asks.count).toBe(5);
    expect(r.asks.median).toBe(1_200_000);
    expect(r.withinRange).toBe(40);
    expect(r.bandFit).toBe("no_band");
  });

  it("buckets market ranking labels in order", () => {
    expect(
      rankingSpread([
        "Average",
        "Top 5% - Exceptional",
        "Average",
        null,
        "Top 25% - Strong (pool of 30)",
      ]),
    ).toEqual([
      { label: "Top 5%", count: 1 },
      { label: "Top 25%", count: 1 },
      { label: "Average", count: 2 },
    ]);
  });
});

import { describe, expect, it } from "vitest";
import {
  draftChanged,
  draftFromProfile,
  icpProblems,
  linesToList,
  nudgeFloor,
  profileFromDraft,
  questionsFromText,
} from "@/lib/work/icp";

describe("icp helpers", () => {
  it("splits lines, drops bullets, blanks and duplicates", () => {
    expect(linesToList("- Go\n\n• SQL\nGo\n  * AWS ")).toEqual(["Go", "SQL", "AWS"]);
  });

  it("round-trips a profile and keeps fields the editor does not show", () => {
    const existing = {
      summary: "Backend lead",
      must_haves: ["Go", "Postgres"],
      nice_to_haves: ["Kafka"],
      years_range: "6-9",
      benchmarks: { scale: "10M users" },
      traits: ["ownership"],
    };
    const d = draftFromProfile(existing);
    expect(d.mustHaves).toBe("Go\nPostgres");
    const out = profileFromDraft({ ...d, mustHaves: "Go\nPostgres\nAWS" }, existing, "x");
    expect(out.must_haves).toEqual(["Go", "Postgres", "AWS"]);
    expect(out.benchmarks).toEqual({ scale: "10M users" });
    expect(out.traits).toEqual(["ownership"]);
  });

  it("never sends an empty summary", () => {
    const out = profileFromDraft(draftFromProfile(null), null, "Data analyst");
    expect(out.summary).toBe("Data analyst");
  });

  it("needs at least one must-have", () => {
    expect(icpProblems(draftFromProfile(null))).toHaveLength(1);
    expect(icpProblems({ summary: "", mustHaves: "Go", niceToHaves: "", years: "" })).toEqual([]);
  });

  it("ignores whitespace-only edits", () => {
    const a = { summary: "a", mustHaves: "Go", niceToHaves: "", years: "" };
    expect(draftChanged(a, { ...a, mustHaves: " Go \n" })).toBe(false);
    expect(draftChanged(a, { ...a, mustHaves: "Go\nSQL" })).toBe(true);
  });

  it("moves the shortlist bar in fives inside 0..95", () => {
    expect(nudgeFloor(62, 5)).toBe(65);
    expect(nudgeFloor(95, 5)).toBe(95);
    expect(nudgeFloor(3, -5)).toBe(0);
  });

  it("checks screening questions", () => {
    expect(questionsFromText("Notice period?\nOK", 5).problem).toMatch(/too short/);
    expect(questionsFromText("a1?\nb2?\nc3?", 2).problem).toMatch(/at most 2/);
    expect(questionsFromText("Notice period?", 5)).toEqual({ list: ["Notice period?"] });
  });
});

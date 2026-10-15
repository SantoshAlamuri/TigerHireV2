import { describe, it, expect } from "vitest";
import { candidateProfileCompleteness } from "@/lib/candidate/profile-completeness";

describe("candidateProfileCompleteness", () => {
  it("is 0 for an empty profile and lists everything as missing", () => {
    const r = candidateProfileCompleteness({});
    expect(r.pct).toBe(0);
    expect(r.missing.length).toBe(r.items.length);
  });

  it("is 100 when every weighted item is satisfied", () => {
    const r = candidateProfileCompleteness({
      fullName: "Asha Rao",
      roleTitle: "Backend Engineer",
      location: "Bengaluru",
      skills: ["Go", "Postgres"],
      experienceYears: 5,
      resumeUrl: "https://x/cv.pdf",
      linkedinUrl: "https://linkedin.com/in/asha",
      hasPreferences: true,
    });
    expect(r.pct).toBe(100);
    expect(r.missing).toEqual([]);
  });

  it("weights résumé highest and reports the right missing step", () => {
    const r = candidateProfileCompleteness({ resumeUrl: "https://x/cv.pdf" });
    expect(r.pct).toBe(25);
    expect(r.missing.some((m) => m.step === "basics")).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { maskCandidateForShortlist } from "@/lib/security/pii";

describe("maskCandidateForShortlist", () => {
  const candidate = {
    id: "c1",
    full_name: "Jane Doe",
    phone: "+919876543210",
    email: "jane@example.com",
    cv_url: "https://storage.example.com/resume.pdf",
    linkedin_url: "https://linkedin.com/in/janedoe",
    skills: ["React", "TypeScript"],
    experience_years: 5,
  };

  it("returns original candidate when unlocked", () => {
    const result = maskCandidateForShortlist(candidate, true);
    expect(result).toEqual(candidate);
  });

  it("masks PII fields when not unlocked", () => {
    const result = maskCandidateForShortlist(candidate, false);
    expect(result.phone).toBeNull();
    expect(result.email).toBeNull();
    expect(result.cv_url).toBeNull();
    expect(result.linkedin_url).toBeNull();
  });

  it("preserves non-PII fields when masked", () => {
    const result = maskCandidateForShortlist(candidate, false);
    expect(result.id).toBe("c1");
    expect(result.skills).toEqual(["React", "TypeScript"]);
    expect(result.experience_years).toBe(5);
  });

  it("masks full name to first name + last initial", () => {
    const result = maskCandidateForShortlist(candidate, false);
    expect(result.full_name).toBe("Jane D.");
  });

  it("masks single-word names correctly", () => {
    const singleName = { ...candidate, full_name: "Madonna" };
    const result = maskCandidateForShortlist(singleName, false);
    expect(result.full_name).toMatch(/^M/);
  });

  it("handles null name", () => {
    const noName = { ...candidate, full_name: null };
    const result = maskCandidateForShortlist(noName, false);
    expect(result.full_name).toBe("Candidate");
  });

  it("handles empty name", () => {
    const emptyName = { ...candidate, full_name: "" };
    const result = maskCandidateForShortlist(emptyName, false);
    expect(result.full_name).toBe("Candidate");
  });

  it("handles multi-word names (uses first and last)", () => {
    const multiName = { ...candidate, full_name: "Jane Marie Doe" };
    const result = maskCandidateForShortlist(multiName, false);
    expect(result.full_name).toBe("Jane D.");
  });
});

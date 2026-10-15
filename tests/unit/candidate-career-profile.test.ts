import { describe, it, expect } from "vitest";
import {
  careerProfileSchema,
  careerProfileSaveSchema,
  emptyCareerProfile,
} from "@/lib/candidate/career-profile";
import { profilePatchSchema } from "@/lib/validations/candidates";

const role = {
  id: "00000000-0000-4000-8000-000000000001",
  role: "Engineer",
  company: "Example",
  location: "",
  startDate: "2024-04",
  endDate: "2023-04",
  current: false,
  highlights: "",
};

describe("candidate career details", () => {
  it("allows an empty profile and explicit clearing of optional links", () => {
    expect(careerProfileSchema.safeParse(emptyCareerProfile()).success).toBe(true);
    expect(
      profilePatchSchema.safeParse({
        name: "Candidate",
        currentCompany: "",
        linkedinUrl: "",
        portfolioUrl: "",
        githubUrl: "",
        referrerWorkEmail: "",
      }).success,
    ).toBe(true);
  });
  it("rejects unsafe links and invalid work modes", () => {
    expect(profilePatchSchema.safeParse({ portfolioUrl: "javascript:alert(1)" }).success).toBe(
      false,
    );
    expect(profilePatchSchema.safeParse({ remotePreference: "sometimes" }).success).toBe(false);
  });
  it("rejects reversed dates and current roles with end dates", () => {
    expect(
      careerProfileSchema.safeParse({ ...emptyCareerProfile(), experience: [role] }).success,
    ).toBe(false);
    expect(
      careerProfileSchema.safeParse({
        ...emptyCareerProfile(),
        experience: [{ ...role, current: true, endDate: "2025-04" }],
      }).success,
    ).toBe(false);
  });
  it("rejects duplicate entries and forged verification flags", () => {
    const current = { ...role, endDate: "", current: true };
    expect(
      careerProfileSchema.safeParse({ ...emptyCareerProfile(), experience: [current, current] })
        .success,
    ).toBe(false);
    expect(
      careerProfileSchema.safeParse({
        ...emptyCareerProfile(),
        skillEvidence: [
          {
            id: role.id,
            skill: "React",
            level: "expert",
            evidence: "Shipped a product",
            lastUsedYear: "2026",
            verified: true,
          },
        ],
      }).success,
    ).toBe(false);
  });
  it("requires a revision and rejects supplied candidate identity", () => {
    expect(careerProfileSaveSchema.safeParse({ document: emptyCareerProfile() }).success).toBe(
      false,
    );
    expect(
      careerProfileSaveSchema.safeParse({
        document: emptyCareerProfile(),
        expectedUpdatedAt: null,
        candidateId: role.id,
      }).success,
    ).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { normalizeParsedCV } from "@/lib/agents/normalizer";
import { validateParsedCV } from "@/lib/agents/validator";
import type { ParsedCV } from "@/lib/agents/schemas";

function buildParsedCV(overrides: Partial<ParsedCV> = {}): ParsedCV {
  return {
    full_name: "Jane Doe",
    email: "jane@example.com",
    canonical_skills: ["ReactJS", "Node JS", "reactjs"],
    seniority_level: "senior",
    years_experience: 6,
    current_title: "Senior Engineer",
    current_company: "Acme private limited",
    location_city: " Bengaluru ",
    salary_expectation_min: 20,
    salary_expectation_max: 18,
    availability: "1_month",
    authenticity_flags: [],
    ...overrides,
  };
}

describe("normalizeParsedCV", () => {
  it("normalizes and de-duplicates skills with aliases", () => {
    const parsed = buildParsedCV();
    const normalized = normalizeParsedCV(parsed);
    expect(normalized.canonical_skills).toEqual(["react", "node.js"]);
  });

  it("fixes inverted salary range and normalizes company/location", () => {
    const normalized = normalizeParsedCV(buildParsedCV());
    expect(normalized.salary_expectation_min).toBe(20);
    expect(normalized.salary_expectation_max).toBe(20);
    expect(normalized.current_company).toBe("Acme Pvt Ltd");
    expect(normalized.location_city).toBe("Bengaluru");
  });
});

describe("validateParsedCV", () => {
  it("flags seniority/experience mismatch", () => {
    const result = validateParsedCV(
      buildParsedCV({ seniority_level: "lead", years_experience: 3 }),
    );
    expect(result.flags).toContain("seniority_experience_mismatch");
  });

  it("flags missing identity fields", () => {
    const result = validateParsedCV(buildParsedCV({ full_name: null, email: null }));
    expect(result.flags).toContain("identity_fields_missing");
  });
});

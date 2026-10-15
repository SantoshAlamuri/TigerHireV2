import type { ParsedCV } from "@/lib/agents/schemas";

export interface CVValidationResult {
  isValid: boolean;
  flags: string[];
}

const SENIORITY_MIN_EXPERIENCE: Partial<Record<ParsedCV["seniority_level"], number>> = {
  mid: 2,
  senior: 5,
  lead: 7,
  head: 9,
  director: 10,
  "c-suite": 12,
};

export function validateParsedCV(parsed: ParsedCV): CVValidationResult {
  const flags: string[] = [];

  if (parsed.canonical_skills.length < 2) {
    flags.push("low_skills_signal");
  }

  const expectedMin = SENIORITY_MIN_EXPERIENCE[parsed.seniority_level];
  if (typeof expectedMin === "number" && parsed.years_experience < expectedMin) {
    flags.push("seniority_experience_mismatch");
  }

  const salaryMin = parsed.salary_expectation_min ?? null;
  const salaryMax = parsed.salary_expectation_max ?? null;
  if (salaryMin !== null && salaryMax !== null && salaryMax < salaryMin) {
    flags.push("salary_range_inverted");
  }

  if (!parsed.full_name && !parsed.email) {
    flags.push("identity_fields_missing");
  }

  return {
    isValid: flags.length === 0,
    flags,
  };
}

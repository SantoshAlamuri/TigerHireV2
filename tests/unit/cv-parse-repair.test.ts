// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const warn = vi.fn();
vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: (...a: unknown[]) => warn(...a), error: vi.fn(), debug: vi.fn() },
}));

import {
  CvParseValidationError,
  isNonRetriableCvParseError,
  parseCvOutputWithRepairs,
  repairParsedCvForSchema,
} from "@/lib/agents/cv-parse-repair";

/** Shape the text-prompt model actually returns, after cv-parser's normalizeParsed(). */
function llmOutput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    full_name: "Dhananjay Singh",
    email: "dhananjay@example.com",
    phone: "+91 98765 43210",
    canonical_skills: ["AWS", "Azure", "Kubernetes"],
    seniority_level: "senior",
    years_experience: 21,
    current_title: "Enterprise Solution Architect",
    current_company: "Voith",
    location_city: "Pune",
    salary_expectation_min: null,
    salary_expectation_max: null,
    availability: "1_month",
    authenticity_flags: [],
    ...overrides,
  };
}

describe("repairParsedCvForSchema — prod regression 2026-09-16 (candidate 56692e3c)", () => {
  it("caps a 21-year architect's skill list at 50 instead of rejecting the whole parse", () => {
    const skills = Array.from({ length: 73 }, (_, i) => `Skill ${i + 1}`);
    const { value, repairs } = repairParsedCvForSchema(llmOutput({ canonical_skills: skills }));
    expect((value.canonical_skills as string[]).length).toBe(50);
    expect(repairs).toContain("skills_capped:73->50");
  });

  it("accepts skill objects from the text prompt and dedupes case-insensitively", () => {
    const { value } = repairParsedCvForSchema(
      llmOutput({
        canonical_skills: [
          { name: "Terraform", verified: false, source: "cv" },
          "terraform",
          "  ",
          { name: "Databricks" },
        ],
      }),
    );
    expect(value.canonical_skills).toEqual(["Terraform", "Databricks"]);
  });

  it("maps 'vp' (allowed by the prompt, missing from the enum) to director", () => {
    const { value, repairs } = repairParsedCvForSchema(llmOutput({ seniority_level: "VP" }));
    expect(value.seniority_level).toBe("director");
    expect(repairs).toContain("seniority_mapped:vp->director");
  });

  it("derives an unknown seniority from years instead of throwing", () => {
    const { value, repairs } = repairParsedCvForSchema(
      llmOutput({ seniority_level: "Enterprise Architect", years_experience: 21 }),
    );
    expect(value.seniority_level).toBe("senior");
    expect(repairs.some((r) => r.startsWith("seniority_mapped:enterprise architect->senior"))).toBe(
      true,
    );
  });

  it("drops an email the extractor mangled rather than losing the whole profile", () => {
    const { value, repairs } = repairParsedCvForSchema(
      llmOutput({ email: "dhananjay.singh @gmail.com | +91" }),
    );
    expect(value.email).toBeNull();
    expect(repairs).toContain("email_invalid_dropped");
  });

  it("maps free-text availability and leaves it null when there is no signal", () => {
    expect(
      repairParsedCvForSchema(llmOutput({ availability: "Serving notice, 15 days" })).value
        .availability,
    ).toBe("immediate");
    expect(
      repairParsedCvForSchema(llmOutput({ availability: "60 days notice" })).value.availability,
    ).toBe("2_months");
    const unknown = repairParsedCvForSchema(llmOutput({ availability: "unknown" }));
    expect(unknown.value.availability).toBeNull();
    expect(unknown.repairs).toContain("availability_mapped:unknown->null");
  });

  it("clamps and coerces years of experience", () => {
    expect(
      repairParsedCvForSchema(llmOutput({ years_experience: "21+ years" })).value.years_experience,
    ).toBe(21);
    expect(
      repairParsedCvForSchema(llmOutput({ years_experience: 64 })).value.years_experience,
    ).toBe(50);
  });

  it("reports no repairs for clean output", () => {
    expect(repairParsedCvForSchema(llmOutput()).repairs).toEqual([]);
  });
});

describe("parseCvOutputWithRepairs", () => {
  it("returns a valid ParsedCV for the prod-shaped output after repairs", () => {
    const parsed = parseCvOutputWithRepairs(
      llmOutput({
        canonical_skills: Array.from({ length: 60 }, (_, i) => `S${i}`),
        seniority_level: "vp",
        availability: null,
      }),
      { candidateId: "cand-1" },
    );
    expect(parsed.canonical_skills.length).toBe(50);
    expect(parsed.seniority_level).toBe("director");
    expect(parsed.availability).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      "cv_parse_output_repaired",
      expect.objectContaining({ candidateId: "cand-1" }),
    );
  });

  it("throws a typed, non-retriable error naming the offending field when repair is impossible", () => {
    let caught: unknown;
    try {
      parseCvOutputWithRepairs(llmOutput({ canonical_skills: [] }));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CvParseValidationError);
    expect((caught as CvParseValidationError).issues[0]?.path).toBe("canonical_skills");
    expect(isNonRetriableCvParseError(caught)).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      "cv_parse_schema_rejected",
      expect.objectContaining({ issues: expect.any(Array) }),
    );
  });
});

describe("isNonRetriableCvParseError", () => {
  it("treats malformed JSON, unreadable files and schema rejections as permanent", () => {
    expect(isNonRetriableCvParseError(new SyntaxError("Unexpected token"))).toBe(true);
    expect(
      isNonRetriableCvParseError(new Error("CV parser: no JSON object in Claude response")),
    ).toBe(true);
    expect(
      isNonRetriableCvParseError(new Error("Could not extract sufficient text from the resume.")),
    ).toBe(true);
  });

  it("keeps transient provider failures retriable", () => {
    expect(isNonRetriableCvParseError(new Error("529 overloaded"))).toBe(false);
    expect(isNonRetriableCvParseError(new Error("rate_limit_error"))).toBe(false);
    expect(isNonRetriableCvParseError(new Error("fetch failed"))).toBe(false);
  });
});

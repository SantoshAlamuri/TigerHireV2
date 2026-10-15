import { describe, it, expect } from "vitest";
import {
  findVerbatimQuoteInResume,
  findIntentRegionInResume,
  normalizeTextForMatch,
  sanitizeUnverifiedQuotes,
  spansOverlap,
  truncateAtWordBoundary,
  validateAndNormalizeEvidenceQuotes,
  NO_DEFENSIBLE_QUOTE,
} from "@/lib/fitscore/hybrid/quote-validation";

describe("hybrid quote validation", () => {
  it("normalizeTextForMatch collapses whitespace and smart quotes", () => {
    const resume = "Led API testing with Postman.";
    const modelQuote = "Led API\u00a0testing with Postman.";
    expect(resume.includes(modelQuote)).toBe(false);
    expect(normalizeTextForMatch(resume).includes(normalizeTextForMatch(modelQuote))).toBe(true);
    expect(findVerbatimQuoteInResume(resume, modelQuote)).toBe("Led API testing with Postman.");
  });

  it("resolves quote from quote_anchor when model quote paraphrases", () => {
    const resume =
      "Experience: Designed test cases for REST APIs using Postman and validated SQL data.";
    const evidence = {
      quotes: [
        {
          dimension: "test_strategy",
          quote: "Designed comprehensive test cases for REST APIs",
          quote_anchor: "Designed test cases for REST",
          location_hint: "Experience section",
        },
      ],
    };
    const prepared = validateAndNormalizeEvidenceQuotes(evidence, resume, ["test_strategy"]);
    expect(prepared.ok).toBe(true);
    expect(prepared.evidence.quotes[0]?.quote).toBe("Designed test cases for REST");
  });

  it("fills missing required dimensions with NO_DEFENSIBLE_QUOTE", () => {
    const resume = "QA engineer with Selenium.";
    const evidence = { quotes: [] };
    const prepared = validateAndNormalizeEvidenceQuotes(evidence, resume, [
      "test_automation",
      "tools",
    ]);
    expect(prepared.ok).toBe(true);
    expect(prepared.evidence.quotes).toHaveLength(2);
    expect(prepared.evidence.quotes.every((q) => q.quote === NO_DEFENSIBLE_QUOTE)).toBe(true);
  });

  it("truncates overlong verbatim matches at a word boundary", () => {
    const words = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    const resume = `Skills: ${words} end.`;
    const resolved = findVerbatimQuoteInResume(resume, words);
    expect(resolved).not.toBeNull();
    expect(resolved!.length).toBeLessThanOrEqual(200);
    expect(resolved).toMatch(/\bword\d+$/);
    expect(resolved).toBe(truncateAtWordBoundary(words, 200));
  });

  it("prefers normalized match overlapping the anchor intent region", () => {
    const resume =
      "Summary: API testing with Postman. Experience: API testing with Postman and SQL.";
    const anchor = "Experience: API testing";
    const intent = findIntentRegionInResume(resume, [anchor]);
    expect(intent).not.toBeNull();

    const resolved = findVerbatimQuoteInResume(resume, "API testing with Postman", 200, intent);
    expect(resolved).not.toBeNull();
    const experienceIdx = resume.indexOf("Experience:");
    const matchAt = resume.indexOf(resolved!, experienceIdx);
    expect(matchAt).toBeGreaterThanOrEqual(experienceIdx);
    expect(spansOverlap(matchAt, matchAt + resolved!.length - 1, intent!.start, intent!.end)).toBe(
      true,
    );
  });
});

describe("sanitizeUnverifiedQuotes", () => {
  const resume = "Led migration of monolith to microservices on AWS. Improved API latency by 30%.";

  it("replaces hallucinated quotes with NO_DEFENSIBLE_QUOTE and reports dimensions", () => {
    const evidence = {
      quotes: [
        {
          dimension: "technical_depth",
          quote: "Invented quote that is not in the resume at all",
          location_hint: "Experience",
        },
        {
          dimension: "execution",
          quote: "Improved API latency by 30%.",
          location_hint: "Impact bullets",
        },
      ],
    };
    const { evidence: sanitized, replacedDimensions } = sanitizeUnverifiedQuotes(evidence, resume);
    expect(replacedDimensions).toEqual(["technical_depth"]);
    expect(sanitized.quotes[0]?.quote).toBe(NO_DEFENSIBLE_QUOTE);
    expect(sanitized.quotes[1]?.quote).toBe("Improved API latency by 30%.");
    expect(JSON.stringify(sanitized)).not.toContain("Invented quote");
  });

  it("keeps NO_DEFENSIBLE_QUOTE sentinels and empty quotes as sentinels", () => {
    const evidence = {
      quotes: [
        { dimension: "a", quote: NO_DEFENSIBLE_QUOTE, location_hint: "none" },
        { dimension: "b", quote: "", location_hint: "none" },
      ],
    };
    const { evidence: sanitized, replacedDimensions } = sanitizeUnverifiedQuotes(evidence, resume);
    expect(replacedDimensions).toEqual([]);
    expect(sanitized.quotes.every((q) => q.quote === NO_DEFENSIBLE_QUOTE)).toBe(true);
  });

  it("preserves amber_flags while sanitizing", () => {
    const evidence = {
      quotes: [{ dimension: "a", quote: "totally fabricated text", location_hint: "" }],
      amber_flags: ["Watch notice period"],
    };
    const { evidence: sanitized } = sanitizeUnverifiedQuotes(evidence, resume);
    expect(sanitized.amber_flags).toEqual(["Watch notice period"]);
    expect(sanitized.quotes[0]?.quote).toBe(NO_DEFENSIBLE_QUOTE);
    expect(sanitized.quotes[0]?.location_hint).toBe(
      "Quote could not be verified against the resume",
    );
  });
});

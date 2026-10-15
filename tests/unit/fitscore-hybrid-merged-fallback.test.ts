import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JDBaseDocument } from "@/lib/fitscore/hybrid/types";

const mockCallClaude = vi.fn();

vi.mock("@/lib/services/anthropic", () => ({
  callClaude: (...args: unknown[]) => mockCallClaude(...args),
  extractJsonObject: (text: string) => JSON.parse(text) as unknown,
}));

vi.mock("@/lib/fitscore/scoring-observability", () => ({
  recordFitScoreObservabilityEvent: vi.fn(),
}));

vi.mock("@/lib/fitscore/resolve-scoring-models", () => ({
  resolveHybridExtractionModel: vi.fn().mockResolvedValue("claude-test-model"),
}));

const jdBase: JDBaseDocument = {
  id: "jdb-1",
  jobId: "job-1",
  roleTitle: "Backend Engineer",
  company: "TigerHire",
  context: "Build distributed systems and reliable APIs",
  weights: { technical_depth: 40, execution: 35, communication: 25 },
  scoreFloor: 15,
  fitThresholds: { strong: 78, good: 60, moderate: 40, weak: 25 },
  approvedBy: "user-1",
  approvedAt: new Date().toISOString(),
};

const resumeText =
  "Led migration of monolith to microservices on AWS.\nImproved API latency by 30 percent.";

const extractionPayload = {
  candidate_name: "Asha",
  total_years: 6,
  dimension_scores: { technical_depth: 8, execution: 7, communication: 6 },
  certifications: [],
  quantified_impact: ["Improved API latency by 30 percent"],
  red_flags: [],
  green_flags: ["Strong ownership"],
  role_match_tag: "Backend Engineer",
  summary: "Strong backend candidate",
};

const HALLUCINATED = "Architected planet-scale quantum infrastructure for 90 million users";

function mergedResponse(quotes: unknown[], whyBody = "Solid gaps analysis. Probe AWS depth.") {
  return {
    text: JSON.stringify({
      extraction: extractionPayload,
      verdict: {
        why_this_verdict: whyBody,
        quotes,
      },
    }),
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

describe("runHybridExtractionAndVerdict exhausted-fallback quote safety", () => {
  beforeEach(() => {
    mockCallClaude.mockReset();
  });

  it("never returns unverified quote text when attempts are exhausted", async () => {
    // MERGED_EXTRACTION_MAX_ATTEMPTS = 1: every attempt returns a hallucinated quote.
    mockCallClaude.mockResolvedValue(
      mergedResponse([
        {
          dimension: "technical_depth",
          quote: HALLUCINATED,
          location_hint: "Experience",
        },
        {
          dimension: "execution",
          quote: "Improved API latency by 30 percent.",
          location_hint: "Impact bullets",
        },
      ]),
    );

    const { runHybridExtractionAndVerdict } =
      await import("@/lib/fitscore/hybrid/extraction-and-verdict");
    const { NO_DEFENSIBLE_QUOTE } = await import("@/lib/fitscore/hybrid/quote-validation");

    const result = await runHybridExtractionAndVerdict(jdBase, resumeText, {
      jobId: "job-1",
      candidateId: "cand-1",
      extractionModel: "claude-test-model",
    });

    expect(result.extraction.candidate_name).toBe("Asha");
    // Hallucinated quote must not survive into returned evidence.
    expect(JSON.stringify(result.evidence)).not.toContain("quantum");
    const byDim = new Map(result.evidence.quotes.map((q) => [q.dimension, q]));
    expect(byDim.get("technical_depth")?.quote).toBe(NO_DEFENSIBLE_QUOTE);
    // Verified quote survives verbatim.
    const executionQuote = byDim.get("execution")?.quote ?? "";
    expect(executionQuote).not.toBe(NO_DEFENSIBLE_QUOTE);
    expect(resumeText.includes(executionQuote)).toBe(true);
  });

  it("returns sentinel quotes for required dimensions when the model omits quotes entirely", async () => {
    mockCallClaude.mockResolvedValue(mergedResponse([], ""));

    const { runHybridExtractionAndVerdict } =
      await import("@/lib/fitscore/hybrid/extraction-and-verdict");
    const { NO_DEFENSIBLE_QUOTE } = await import("@/lib/fitscore/hybrid/quote-validation");

    const result = await runHybridExtractionAndVerdict(jdBase, resumeText, {
      jobId: "job-1",
      candidateId: "cand-1",
      extractionModel: "claude-test-model",
    });

    // Missing required dimensions get filled with explicit sentinels, never invented text.
    expect(result.evidence.quotes.length).toBeGreaterThan(0);
    expect(result.evidence.quotes.every((q) => q.quote === NO_DEFENSIBLE_QUOTE)).toBe(true);
  });

  it("returns validated evidence directly on a successful attempt", async () => {
    mockCallClaude.mockResolvedValue(
      mergedResponse([
        {
          dimension: "technical_depth",
          quote: "Led migration of monolith to microservices on AWS.",
          location_hint: "Experience",
        },
        {
          dimension: "execution",
          quote: "Improved API latency by 30 percent.",
          location_hint: "Impact bullets",
        },
      ]),
    );

    const { runHybridExtractionAndVerdict } =
      await import("@/lib/fitscore/hybrid/extraction-and-verdict");

    const result = await runHybridExtractionAndVerdict(jdBase, resumeText, {
      jobId: "job-1",
      candidateId: "cand-1",
      extractionModel: "claude-test-model",
    });

    expect(mockCallClaude).toHaveBeenCalledTimes(1);
    expect(result.verdictWhyBody).toContain("Probe AWS depth");
    expect(result.evidence.quotes).toHaveLength(2);
    for (const q of result.evidence.quotes) {
      expect(resumeText.includes(q.quote)).toBe(true);
    }
  });
});

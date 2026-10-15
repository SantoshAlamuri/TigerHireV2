import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CandidateExtraction,
  JDBaseDocument,
  ScoreBreakdown,
} from "@/lib/fitscore/hybrid/types";

const mockCallClaude = vi.fn();

vi.mock("@/lib/services/anthropic", () => ({
  callClaude: (...args: unknown[]) => mockCallClaude(...args),
  extractJsonObject: (text: string) => JSON.parse(text) as unknown,
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

const extraction: CandidateExtraction = {
  candidate_name: "Asha",
  total_years: 6,
  dimension_scores: { technical_depth: 8, execution: 7, communication: 6 },
  certifications: ["AWS SA"],
  quantified_impact: ["Improved throughput by 30%"],
  red_flags: [],
  green_flags: ["Strong ownership"],
  role_match_tag: "Backend Engineer",
  summary: "Strong backend candidate",
};

const breakdown: ScoreBreakdown = {
  rawDimScore: 70,
  certBonus: 1.5,
  impactBonus: 2,
  greenBonus: 2,
  redPenalty: 0,
  redPenaltyUncapped: 0,
  dimensions: {
    technical_depth: { value: 8, weight: 40, contribution: 32 },
    execution: { value: 7, weight: 35, contribution: 24.5 },
    communication: { value: 6, weight: 25, contribution: 15 },
  },
  formulaLines: [],
};

describe("hybrid LLM payload shaping", () => {
  beforeEach(() => {
    mockCallClaude.mockReset();
  });

  it("marks extraction system/static context as cacheable", async () => {
    mockCallClaude.mockResolvedValue({
      text: "{}",
      usage: { input_tokens: 100, output_tokens: 20 },
    });
    const { runHybridExtraction } = await import("@/lib/fitscore/hybrid/extraction");
    await runHybridExtraction(jdBase, "Resume text ".repeat(200));
    const args = mockCallClaude.mock.calls[0][0] as Record<string, unknown>;
    const system = args.system as Array<Record<string, unknown>>;
    const messages = args.messages as Array<Record<string, unknown>>;
    const content = messages[0]?.content as Array<Record<string, unknown>>;
    expect(system[0]?.cache_control).toEqual({ type: "ephemeral" });
    expect(content[0]?.cache_control).toEqual({ type: "ephemeral" });
    expect(content[1]?.cache_control).toBeUndefined();
  });

  it("retries explanation when first quotes are invalid", async () => {
    const resumeText =
      "Led migration of monolith to microservices on AWS.\nImproved API latency by 30 percent.";
    mockCallClaude
      .mockResolvedValueOnce({
        text: JSON.stringify({
          text: "First attempt explanation.",
          quotes: [
            {
              dimension: "technical_depth",
              quote: "Paraphrased non-verbatim quote",
              location_hint: "Experience",
            },
            {
              dimension: "execution",
              quote: "NO_DEFENSIBLE_QUOTE",
              location_hint: "No direct quote",
            },
          ],
        }),
        usage: { input_tokens: 120, output_tokens: 60 },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          text: "Final explanation with evidence. It references concrete work. It highlights one risk.",
          quotes: [
            {
              dimension: "technical_depth",
              quote: "Led migration of monolith to microservices on AWS.",
              location_hint: "Backend Engineer role",
            },
            {
              dimension: "execution",
              quote: "Improved API latency by 30 percent.",
              location_hint: "Impact bullets",
            },
          ],
        }),
        usage: { input_tokens: 120, output_tokens: 60 },
      });

    const { runHybridExplanation } = await import("@/lib/fitscore/hybrid/explanation");
    const result = await runHybridExplanation({
      jdBase,
      extraction,
      fitScore: 76,
      fitLabel: "Good Fit",
      breakdown,
      resumeText,
    });

    expect(mockCallClaude).toHaveBeenCalledTimes(2);
    expect(result.evidence.quotes).toHaveLength(2);
    expect(resumeText.includes(result.evidence.quotes[0].quote)).toBe(true);
  });
});

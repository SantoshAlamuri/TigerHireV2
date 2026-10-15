import { describe, it, expect } from "vitest";
import { demoJdSchema, demoRubricSchema, normalizeWeights } from "@/lib/agents/demo-rubric";
import { demoVerdictSchema } from "@/lib/agents/demo-score";
import { FALLBACK_RUBRIC, FALLBACK_SCORED } from "@/components/marketing/v2/demo-data";

describe("demo rubric schema", () => {
  it("rejects short and oversized JDs", () => {
    expect(demoJdSchema.safeParse({ jd: "too short" }).success).toBe(false);
    expect(demoJdSchema.safeParse({ jd: "x".repeat(6001) }).success).toBe(false);
    expect(demoJdSchema.safeParse({ jd: "a valid job description ".repeat(10) }).success).toBe(
      true,
    );
  });

  it("rejects rubrics with out-of-range weights or wrong criterion counts", () => {
    expect(
      demoRubricSchema.safeParse({
        roleTitle: "Role",
        criteria: [{ name: "Only one", weight: 100 }],
      }).success,
    ).toBe(false);
  });

  it("clamps drifted weights and over-long names instead of rejecting", () => {
    const parsed = demoRubricSchema.parse({
      roleTitle: "Role",
      criteria: [
        { name: "A".repeat(80), weight: 70 },
        { name: "Criterion B", weight: 10 },
        { name: "Criterion C", weight: 10 },
        { name: "Criterion D", weight: 10 },
      ],
    });
    expect(parsed.criteria[0].name).toHaveLength(60);
    expect(parsed.criteria[0].weight).toBe(60);
  });

  it("normalizeWeights rescales drifted weights to sum exactly 100", () => {
    const drifted = {
      roleTitle: "Role",
      criteria: [
        { name: "A", weight: 40 },
        { name: "B", weight: 30 },
        { name: "C", weight: 20 },
        { name: "D", weight: 20 },
      ],
    };
    const normalized = normalizeWeights(drifted);
    const total = normalized.criteria.reduce((sum, c) => sum + c.weight, 0);
    expect(total).toBe(100);
  });

  it("normalizeWeights leaves already-correct rubrics untouched", () => {
    expect(normalizeWeights(FALLBACK_RUBRIC)).toEqual(FALLBACK_RUBRIC);
  });
});

describe("demo verdict schema", () => {
  it("accepts every canned fallback verdict (fallback stays in sync with schema)", () => {
    for (const candidate of FALLBACK_SCORED) {
      expect(demoVerdictSchema.safeParse(candidate.result).success).toBe(true);
    }
  });

  it("rejects unknown verdict enums and out-of-range scores", () => {
    const base = FALLBACK_SCORED[0].result;
    expect(demoVerdictSchema.safeParse({ ...base, verdict: "MAYBE" }).success).toBe(false);
    expect(demoVerdictSchema.safeParse({ ...base, fitScore: 140 }).success).toBe(false);
    expect(demoVerdictSchema.safeParse({ ...base, confidence: 1.4 }).success).toBe(false);
  });
});

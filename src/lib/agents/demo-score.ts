import { z } from "zod";
import { callClaude, extractJsonObject } from "@/lib/services/anthropic";
import { MODELS } from "@/lib/config/models";
import { logger } from "@/lib/observability/logger";
import { demoRubricSchema, type DemoRubric } from "@/lib/agents/demo-rubric";
import { DEMO_CANDIDATES, type DemoCandidate } from "@/lib/agents/demo-candidates";

/**
 * Homepage live-demo scorer. Scores the fixed 5-profile sample pool against a
 * demo rubric with one Haiku call per candidate. Marketing demo only — no DB
 * writes, no real candidates, no persistence.
 */

export const demoScoreRequestSchema = z.object({
  rubric: demoRubricSchema,
});

const verdictSchema = z.enum(["STRONG_HIRE", "HIRE", "SCREEN", "PASS"]);

/** Model drift on text lengths shouldn't sink a verdict — clamp, don't reject. */
const clampedText = (max: number, min: number) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim().slice(0, max) : v),
    z.string().min(min).max(max),
  );
const flagSchema = z.object({
  type: z.enum(["ok", "warn", "miss"]),
  text: clampedText(120, 3),
});

export const demoVerdictSchema = z.object({
  fitScore: z.number().int().min(0).max(100),
  verdict: verdictSchema,
  idealMatch: z.number().int().min(0).max(100),
  confidence: z.number().min(0).max(1),
  dimensions: z
    .array(z.object({ name: clampedText(60, 2), score: z.number().int().min(0).max(100) }))
    .min(4)
    .max(6),
  flags: z.array(flagSchema).min(2).max(4),
  rationale: clampedText(420, 20),
});

export type DemoVerdict = z.infer<typeof demoVerdictSchema>;

export interface DemoScoredCandidate {
  id: string;
  name: string;
  initials: string;
  headline: string;
  result: DemoVerdict;
}

function scoreSystem(rubric: DemoRubric): string {
  const criteria = rubric.criteria.map((c) => `- ${c.name} (weight ${c.weight}%)`).join("\n");
  return `You are TigerHire's FitScore engine scoring one candidate CV against an approved rubric for the role "${rubric.roleTitle}".

Rubric criteria:
${criteria}

Return ONLY a JSON object with this exact shape (no markdown, no commentary):
{
  "fitScore": number,        // integer 0-100, weighted by the rubric
  "verdict": "STRONG_HIRE" | "HIRE" | "SCREEN" | "PASS",
  "idealMatch": number,      // integer 0-100: how closely the CV matches the rubric's ideal profile
  "confidence": number,      // 0-1, lower when the CV lacks evidence to judge
  "dimensions": [ { "name": string, "score": number } ],  // one entry per rubric criterion, same order, score 0-100
  "flags": [ { "type": "ok" | "warn" | "miss", "text": string } ],  // 2-4 items, text max 120 chars
  "rationale": string        // 1-3 plain-English sentences, max 420 chars, citing CV evidence only
}

Rules:
- Score ONLY from evidence in the CV text. Never invent experience.
- "miss" flags are for rubric requirements with no CV evidence; "warn" for partial evidence.
- Be honest: profiles from unrelated fields should score low with a PASS verdict.`;
}

async function scoreOne(
  rubric: DemoRubric,
  candidate: DemoCandidate,
): Promise<DemoScoredCandidate> {
  const response = await callClaude({
    model: MODELS.HAIKU,
    max_tokens: 700,
    temperature: 0,
    label: "demo_score",
    system: scoreSystem(rubric),
    messages: [{ role: "user", content: `Candidate CV:\n\n${candidate.resume}` }],
  });
  const raw = extractJsonObject(response.text, "demo_score");
  const result = demoVerdictSchema.parse(raw);
  return {
    id: candidate.id,
    name: candidate.name,
    initials: candidate.initials,
    headline: candidate.headline,
    result,
  };
}

/**
 * Scores a pool (the fixed 10-profile sample pool by default, or transient
 * uploaded CVs) in parallel. Individual failures are dropped (with a distinct
 * warn event) rather than failing the whole demo; the route treats too few
 * survivors as a degraded run.
 */
export async function scoreDemoPool(
  rubric: DemoRubric,
  pool: DemoCandidate[] = DEMO_CANDIDATES,
): Promise<DemoScoredCandidate[]> {
  const settled = await Promise.allSettled(pool.map((c) => scoreOne(rubric, c)));
  const scored: DemoScoredCandidate[] = [];
  settled.forEach((outcome, i) => {
    if (outcome.status === "fulfilled") {
      scored.push(outcome.value);
    } else {
      logger.warn("demo_score_candidate_failed", {
        candidateId: pool[i].id,
        error: String(outcome.reason),
      });
    }
  });
  return scored.sort((a, b) => b.result.fitScore - a.result.fitScore);
}

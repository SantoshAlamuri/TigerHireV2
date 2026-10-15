import { z } from "zod";
import { callClaude, extractJsonObject } from "@/lib/services/anthropic";
import { MODELS } from "@/lib/config/models";

/**
 * Homepage live-demo rubric builder. Public, unauthenticated, heavily
 * rate-limited at the route layer. Takes a pasted JD and returns a small
 * weighted rubric — the same concept the JD Intelligence agent produces for
 * real jobs, but scoped to a marketing demo (no DB writes, no job rows).
 */

export const demoJdSchema = z.object({
  jd: z
    .string()
    .trim()
    .min(80, "Paste a fuller job description (at least 80 characters).")
    .max(6000, "Job description is too long for the demo (max 6,000 characters)."),
});

/** Model drift on lengths shouldn't sink the whole rubric — clamp, don't reject. */
function truncateAtWord(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
const clampedName = z.preprocess(
  (v) => (typeof v === "string" ? truncateAtWord(v.trim(), 60) : v),
  z.string().min(2).max(60),
);
const clampedWeight = z.preprocess(
  (v) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(60, Math.max(5, Math.round(v))) : v,
  z.number().int().min(5).max(60),
);
const criterionSchema = z.object({ name: clampedName, weight: clampedWeight });

export const demoRubricSchema = z.object({
  roleTitle: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().slice(0, 80) : v),
    z.string().min(2).max(80),
  ),
  criteria: z.array(criterionSchema).min(4).max(6),
});

export type DemoRubric = z.infer<typeof demoRubricSchema>;

const RUBRIC_SYSTEM = `You are TigerHire's JD Intelligence agent producing a weighted screening rubric from a job description.

Return ONLY a JSON object with this exact shape (no markdown, no commentary):
{
  "roleTitle": string,           // concise role title inferred from the JD, max 80 chars
  "criteria": [                  // exactly 4 to 6 items
    { "name": string, "weight": number }  // name max 60 chars; weight is an integer 5-60
  ]
}

Rules:
- Weights MUST sum to exactly 100.
- Criteria must be evaluable from a CV: demonstrated outcomes, competencies, and scope of ownership — never personality guesses.
- NEVER use years of experience or tenure as a criterion — weight what the candidate has demonstrably done, not how long they've been around. Certifications only when the JD explicitly requires them.
- Order criteria from highest weight to lowest.`;

/** Normalizes weights so they always sum to 100 even if the model drifts. */
export function normalizeWeights(rubric: DemoRubric): DemoRubric {
  const total = rubric.criteria.reduce((sum, c) => sum + c.weight, 0);
  if (total === 100 || total <= 0) return rubric;
  let running = 0;
  const scaled = rubric.criteria.map((c, i) => {
    if (i === rubric.criteria.length - 1) {
      return { ...c, weight: Math.max(5, 100 - running) };
    }
    const w = Math.max(5, Math.round((c.weight / total) * 100));
    running += w;
    return { ...c, weight: w };
  });
  return { ...rubric, criteria: scaled };
}

export async function buildDemoRubric(jd: string): Promise<DemoRubric> {
  const response = await callClaude({
    model: MODELS.SONNET,
    max_tokens: 600,
    temperature: 0,
    label: "demo_rubric",
    system: RUBRIC_SYSTEM,
    messages: [{ role: "user", content: `Job description:\n\n${jd}` }],
  });
  const raw = extractJsonObject(response.text, "demo_rubric");
  return normalizeWeights(demoRubricSchema.parse(raw));
}

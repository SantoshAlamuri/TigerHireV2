import { z } from "zod";
import { structuredJdSchema } from "@/lib/fitscore/hybrid/structured-jd";

const redFlagSchema = z.object({
  flag: z.string(),
  severity: z.enum(["critical", "moderate", "minor"]).catch("moderate"),
});

/** Fields we accept as the flag/entry text when the model emits an object instead of a string. */
const FLAG_TEXT_KEYS = ["flag", "issue", "text", "description"] as const;

/** Pull usable text out of a string or object element; null when nothing usable. */
function extractElementText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of FLAG_TEXT_KEYS) {
      const candidate = (value as Record<string, unknown>)[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
  }
  return null;
}

function normalizeSeverity(value: unknown): "critical" | "moderate" | "minor" {
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (s === "critical" || s === "moderate" || s === "minor") return s;
  }
  return "moderate";
}

/**
 * Element-tolerant red_flags coercion: one malformed element must never wipe the
 * whole array (a candidate with critical red flags would render spotless).
 * - bare string -> { flag, severity: "moderate" }
 * - object with a recognizable text field -> canonical shape (severity lowercased/trimmed)
 * - elements with no usable flag text are dropped; non-array input -> []
 */
function coerceRedFlagArray(input: unknown): Array<{ flag: string; severity: string }> {
  if (!Array.isArray(input)) return [];
  const out: Array<{ flag: string; severity: string }> = [];
  for (const element of input) {
    const flag = extractElementText(element);
    if (!flag) continue;
    const severity =
      element && typeof element === "object"
        ? normalizeSeverity((element as Record<string, unknown>).severity)
        : "moderate";
    out.push({ flag, severity });
  }
  return out;
}

/** Element-tolerant string array: keep strings, coerce objects with a text field, drop the rest. */
function coerceStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const element of input) {
    const text = extractElementText(element);
    if (text) out.push(text);
  }
  return out;
}

function clamp110(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 1;
  return Math.min(10, Math.max(1, x));
}

export const candidateExtractionSchema = z
  .object({
    candidate_name: z.string().catch(""),
    total_years: z.coerce.number().catch(0),
    dimension_scores: z.record(z.string(), z.preprocess(clamp110, z.number())).catch({}),
    certifications: z.preprocess(coerceStringArray, z.array(z.string())).catch([]),
    quantified_impact: z.preprocess(coerceStringArray, z.array(z.string())).catch([]),
    red_flags: z.preprocess(coerceRedFlagArray, z.array(redFlagSchema)).catch([]),
    green_flags: z.preprocess(coerceStringArray, z.array(z.string())).catch([]),
    role_match_tag: z.string().catch("General"),
    summary: z.string().catch(""),
    ideal_match_pct: z.coerce.number().min(0).max(100).optional(),
    ideal_gaps: z.array(z.string()).optional(),
  })
  .transform((o) => ({
    ...o,
    red_flags: o.red_flags.map((r) => ({
      flag: r.flag,
      severity: r.severity as "critical" | "moderate" | "minor",
    })),
  }));

export const fitThresholdsSchema = z
  .object({
    strong: z.coerce.number().min(0).max(100),
    good: z.coerce.number().min(0).max(100),
    moderate: z.coerce.number().min(0).max(100),
    weak: z.coerce.number().min(0).max(100),
  })
  .strip();

/** Dynamic weights: arbitrary string keys mapped to non-negative numbers. */
export const scoringWeightsSchema = z.record(z.string(), z.coerce.number().min(0));

export const hybridScoreRequestSchema = z.object({
  jobId: z.string().uuid(),
  candidateId: z.string().uuid(),
});

export const hybridBatchRequestSchema = z.object({
  jobId: z.string().uuid(),
  candidateIds: z.array(z.string().uuid()).min(1).max(200),
});

export const jdBaseGenerateSchema = z.object({
  jobId: z.string().uuid(),
});

export const jdBaseFromTemplateSchema = z.object({
  jobId: z.string().uuid(),
  templateId: z.string().min(1).max(120),
});

export const idealCandidateProfileSchema = z.object({
  summary: z.string().min(1),
  must_haves: z.array(z.string()),
  nice_to_haves: z.array(z.string()),
  years_range: z.string(),
  benchmarks: z.record(z.string(), z.string()),
  traits: z.array(z.string()).optional(),
  background_preferences: z.array(z.string()).optional(),
  /** Measurable results the hire must deliver. Were silently stripped before. */
  outcomes: z.array(z.string()).optional(),
  /** Behavioural competencies for the role. Were silently stripped before. */
  competencies: z.array(z.string()).optional(),
});

export const jdBaseUpdateSchema = z.object({
  jobId: z.string().uuid(),
  roleTitle: z.string().min(1).optional(),
  company: z.string().min(1).optional(),
  context: z.string().min(1).optional(),
  weights: scoringWeightsSchema.optional(),
  scoreFloor: z.coerce.number().min(0).max(100).optional(),
  fitThresholds: fitThresholdsSchema.optional(),
  extractionAdditions: z.string().nullable().optional(),
  idealCandidateProfile: idealCandidateProfileSchema.nullable().optional(),
  structuredJd: structuredJdSchema.optional(),
});

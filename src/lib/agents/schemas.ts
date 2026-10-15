import { z } from "zod";

export const SeniorityLevel = z.enum([
  "intern",
  "junior",
  "mid",
  "senior",
  "lead",
  "head",
  "director",
  "c-suite",
]);

export const ParsedCVSchema = z.object({
  full_name: z.string().max(200).optional().nullable(),
  email: z.string().email().max(200).optional().nullable(),
  /** CV header / contact line — stored digits-normalised downstream */
  phone: z.string().max(40).optional().nullable(),
  canonical_skills: z.array(z.string().min(1).max(60)).min(1).max(50),
  seniority_level: SeniorityLevel,
  years_experience: z
    .number()
    .min(0)
    .max(50)
    .transform((n) => Math.round(n)),
  current_title: z.string().max(200).optional().nullable(),
  current_company: z.string().max(200).optional().nullable(),
  location_city: z.string().max(100).optional().nullable(),
  salary_expectation_min: z.number().min(0).nullable(),
  salary_expectation_max: z.number().min(0).nullable(),
  /** Null when the CV gives no signal — the parser maps free text, never guesses. */
  availability: z
    .enum(["immediate", "1_month", "2_months", "3_plus_months", "not_looking"])
    .nullable()
    .default(null),
  authenticity_flags: z.array(z.string()).default([]),
});

export type ParsedCV = z.infer<typeof ParsedCVSchema>;

export const FitSummarySchema = z.object({
  summary: z.string().min(20).max(400),
  green_flags: z.array(z.string().max(100)).max(3),
  amber_flags: z.array(z.string().max(100)).max(3),
  red_flags: z.array(z.string().max(100)).max(3),
  recommendation: z.enum(["shortlist", "consider", "pass"]),
});

export type FitSummary = z.infer<typeof FitSummarySchema>;

export const VouchScoreSchema = z.object({
  specificity_score: z.number().int().min(0).max(100),
  credibility_multiplier: z.number().min(0.5).max(2.0),
  summary: z.string().max(200),
});

export type VouchScore = z.infer<typeof VouchScoreSchema>;

export const VerifyResultSchema = z.object({
  consistency_score: z.number().int().min(0).max(100),
  flags: z
    .array(
      z.object({
        type: z.enum(["date_overlap", "title_inflation", "company_mismatch", "skill_gap"]),
        description: z.string().max(200),
        severity: z.enum(["low", "medium", "high"]),
      }),
    )
    .max(10),
  overall_verdict: z.enum(["clean", "flagged", "suspicious"]),
});

export type VerifyResult = z.infer<typeof VerifyResultSchema>;

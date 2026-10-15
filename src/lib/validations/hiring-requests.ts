import { z } from "zod";

const urgencyEnum = z.enum(["low", "normal", "high", "urgent", "critical"]);

const employmentTypeEnum = z.enum(["full_time", "contract", "intern"]);
const locationTypeEnum = z.enum(["office", "remote", "hybrid"]);
const headcountTypeEnum = z.enum(["new_hire", "backfill"]);

export const createHiringRequestSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(500)
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "Title is required")),
  department: z.string().max(200).optional().nullable(),
  headcount: z.number().int().min(1).max(100).optional().default(1),
  urgency: urgencyEnum.optional().default("normal"),
  description: z.string().max(10000).optional().nullable(),
  /** Structured ideal-candidate profile — seeds the JD + scoring ICP on convert. */
  mustHaves: z.string().max(4000).optional().nullable(),
  niceToHaves: z.string().max(4000).optional().nullable(),
  idealExperience: z.string().max(200).optional().nullable(),
  idealSummary: z.string().max(4000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  /** When true, save as draft (no REQ code, no recruiter notifications). */
  saveDraft: z.boolean().optional().default(false),
  roleLevel: z.string().max(120).optional().nullable(),
  costCenter: z.string().max(120).optional().nullable(),
  employmentType: employmentTypeEnum.optional().nullable(),
  locationType: locationTypeEnum.optional().nullable(),
  locationCity: z.string().max(200).optional().nullable(),
  headcountType: headcountTypeEnum.optional().nullable(),
  businessJustification: z.string().max(8000).optional().nullable(),
  targetJoiningDate: z.string().max(32).optional().nullable(),
  budgetCtcMin: z.number().nonnegative().optional().nullable(),
  budgetCtcMax: z.number().nonnegative().optional().nullable(),
  templateId: z.string().uuid().optional().nullable(),
  headcountPlanLineId: z.string().uuid().optional().nullable(),
});

export type CreateHiringRequestInput = z.infer<typeof createHiringRequestSchema>;

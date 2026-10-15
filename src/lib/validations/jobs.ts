import { z } from "zod";

const DESCRIPTION_MAX_WORDS = 9000;

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export const jdSectionsLegacySchema = z.object({
  designation: z.string().optional(),
  reportingTo: z.string().optional(),
  aboutCompany: z.string().optional(),
  rolesAndResponsibilities: z.array(z.string()).optional(),
  technicalSkills: z.array(z.string()).optional(),
  leadershipSkills: z.array(z.string()).optional(),
  softSkills: z.array(z.string()).optional(),
  preferredSkills: z.array(z.string()).optional(),
  niceToHave: z.array(z.string()).optional(),
  benefits: z.array(z.string()).optional(),
  educationRequirements: z.string().optional(),
  employmentType: z.string().optional(),
  experienceRange: z.string().optional(),
  noticePeriod: z.string().optional(),
});

export const jdSectionItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(["text", "list", "tags"]),
  value: z.union([z.string(), z.array(z.string())]),
});

export const jdSectionsDynamicSchema = z.object({
  version: z.literal(2),
  sections: z.array(jdSectionItemSchema),
});

export const jdSectionsSchema = z
  .union([jdSectionsLegacySchema, jdSectionsDynamicSchema])
  .optional();

export type JdSections = z.infer<typeof jdSectionsSchema>;
export type JdSectionsLegacy = z.infer<typeof jdSectionsLegacySchema>;

const createJobBaseSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(200),
  description: z.string().min(50, "Description must be at least 50 characters"),
  location: z.string().optional(),
  status: z.enum(["draft", "open", "closed"]).default("open"),
  compensationMin: z.number().min(0).optional(),
  compensationMax: z.number().min(0).optional(),
  skillsRequired: z.array(z.string()).optional(),
  skillsPreferred: z.array(z.string()).optional(),
  remoteAllowed: z.boolean().optional(),
  seniorityLevel: z.string().optional(),
  roleFunction: z.string().optional(),
  hiringManagerId: z.string().uuid().optional().nullable(),
  hiringRequestId: z.string().uuid().optional(),
  assignedRecruiterId: z.string().uuid().optional().nullable(),
  jdSections: jdSectionsSchema,
  organisationId: z.string().uuid().optional(),
  /** When true, job may appear on the public job board (default true). */
  listOnPublicJobBoard: z.boolean().optional(),
  /** When true, job may appear in org-scoped employee/referrer pickers (default true). */
  listForInternalReferrals: z.boolean().optional(),
  /** Optional instant after which new applications should stop; existing applicants get deadline nudges. */
  applicationsCloseAt: z.string().datetime().optional(),
});

const descriptionWordLimit = (data: { description?: string }) =>
  countWords(data.description ?? "") <= DESCRIPTION_MAX_WORDS;

const descriptionWordLimitMessage = {
  message: `Job description must be at most ${DESCRIPTION_MAX_WORDS.toLocaleString()} words`,
  path: ["description"],
};

const listingAtLeastOne = (data: {
  listOnPublicJobBoard?: boolean;
  listForInternalReferrals?: boolean;
}) => {
  const pub = data.listOnPublicJobBoard ?? true;
  const internal = data.listForInternalReferrals ?? true;
  return pub || internal;
};

const listingAtLeastOneMessage = {
  message: "Choose at least one: public job board or internal referrals.",
  path: ["listOnPublicJobBoard"] as string[],
};

export const createJobSchema = createJobBaseSchema
  .refine(descriptionWordLimit, descriptionWordLimitMessage)
  .refine(listingAtLeastOne, listingAtLeastOneMessage);

export const DESCRIPTION_MAX_WORDS_EXPORT = DESCRIPTION_MAX_WORDS;

export const updateJobSchema = createJobBaseSchema
  .partial()
  .extend({
    /** Omit field to leave unchanged; pass null to clear the deadline. */
    applicationsCloseAt: z.union([z.string().datetime(), z.null()]).optional(),
  })
  .refine(descriptionWordLimit, descriptionWordLimitMessage);

export const jobQuerySchema = z.object({
  view: z.literal("summary").optional(),
  status: z.enum(["draft", "open", "closed"]).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

/** Anonymous job board — tighter limits, bounded search length. */
export const publicJobListQuerySchema = z.object({
  role: z
    .enum([
      "all",
      "backend",
      "frontend",
      "data_ml",
      "product",
      "devops",
      "design",
      "sales",
      "finance",
    ])
    .default("backend"),
  city: z
    .enum(["all", "bangalore", "delhi_ncr", "mumbai", "hyderabad", "chennai", "pune", "remote"])
    .default("bangalore"),
  tier: z.enum(["all", "native"]).default("all"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type JobQueryInput = z.infer<typeof jobQuerySchema>;

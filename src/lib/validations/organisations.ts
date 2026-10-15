import { z } from "zod";
import { ORG_INVITE_ROLES, USER_ROLES } from "@/types/database";
import { ENTITLEMENT_FEATURE_KEYS } from "@/lib/entitlements/config";

export const organisationApprovalSchema = z.enum(["pending", "approved", "rejected"]);
export const organisationTypeSchema = z.enum(["company", "agency"]);

export const createOrganisationSchema = z.object({
  type: organisationTypeSchema,
  name: z.string().trim().min(2).max(200),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase with hyphens only")
    .optional(),
  approval: organisationApprovalSchema.optional(),
});

export const updateOrganisationSchema = z.object({
  name: z.string().min(2).optional(),
  email_domain: z.string().max(100).optional(),
  /** Super admin only: enforce SSO for company-side users in this organisation. */
  enforce_sso: z.boolean().optional(),
  /** Company/super admin: require AAL2 (2FA) for password logins in this organisation. */
  enforce_2fa: z.boolean().optional(),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase with hyphens only")
    .optional(),
  /** Super admin only: target organisation to update (e.g. for approval). */
  organisationId: z.string().uuid().optional(),
  /** Super admin only: set approval status (for agencies). */
  approval: organisationApprovalSchema.optional(),
});

export const deleteOrganisationSchema = z.object({
  organisationId: z.string().uuid("Valid organisation required"),
});

export const inviteMemberSchema = z.object({
  email: z.string().email("Valid email required"),
  role: z.enum(ORG_INVITE_ROLES).default("recruiter"),
});

export const patchMemberStatusSchema = z
  .object({
    userId: z.string().uuid(),
    isActive: z.boolean(),
  })
  .strict();

export const patchMemberOrgAdminSchema = z
  .object({
    userId: z.string().uuid(),
    isOrgAdmin: z.boolean(),
  })
  .strict();

export const BULK_INVITE_MAX_ROWS = 200;

export const bulkInviteCsvSchema = z.object({
  csv: z.string().min(1, "CSV content is required"),
  organisationId: z.string().uuid("Valid organisation required").optional(),
  dryRun: z.boolean().optional().default(false),
});

export const bulkInviteRowSchema = z.object({
  email: z.string().email("Valid email required"),
  role: z.enum(ORG_INVITE_ROLES).default("recruiter"),
  fullName: z.string().max(200).optional(),
});

/** Platform admin invite: add a user to an organisation (e.g. employee, recruiter). */
export const adminInviteUserSchema = z.object({
  email: z.string().email("Valid email required"),
  fullName: z.string().min(1, "Name required").max(200),
  role: z.enum(ORG_INVITE_ROLES),
  organisationId: z.string().uuid("Valid organisation required"),
});

export const adminUpdateUserSchema = z
  .object({
    userId: z.string().min(1, "userId is required").max(200),
    role: z.enum(USER_ROLES).optional(),
    fullName: z.string().trim().min(1, "fullName cannot be empty").max(200).optional(),
    email: z.string().trim().email("Valid email required").max(320).optional(),
    organisationId: z.string().uuid("Valid organisationId required").nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.role !== undefined ||
      data.fullName !== undefined ||
      data.email !== undefined ||
      data.organisationId !== undefined ||
      data.isActive !== undefined,
    { message: "At least one field to update is required" },
  );

export const adminDeleteUserSchema = z.object({
  userId: z.string().uuid("Valid userId required"),
});

export const adminResetPasswordSchema = z.object({
  email: z.string().email("Valid email required"),
  newPassword: z.string().min(8, "newPassword is required (min 8 characters)").max(1024),
});

export const agencyClientCreateSchema = z.object({
  slug: z.string().min(1, "slug is required"),
  name: z.string().trim().min(1).max(200).optional(),
});

export const fitScoreRequestSchema = z.object({
  jobId: z.string().uuid("Valid job ID required"),
  candidateId: z.string().uuid("Valid candidate ID required").optional(),
});

/** Candidate requests their own fit score for a job (candidateId resolved server-side). */
export const fitScoreCandidateRequestSchema = z.object({
  jobId: z.string().uuid("Valid job ID required"),
});

export const batchFitScoreSchema = z.object({
  jobId: z.string().uuid("Valid job ID required"),
  candidateIds: z.array(z.string().uuid()).min(1).max(50).optional(),
});

export const selectBlendSchema = z.object({
  candidate_id: z.string().min(1, "candidate_id is required"),
  job_id: z.string().min(1, "job_id is required"),
  selection: z.enum(["primary", "shadow"]),
});

export const entitlementFeatureKeySchema = z.enum(ENTITLEMENT_FEATURE_KEYS);

export const adminOrgFeatureOverrideSchema = z.object({
  featureKey: entitlementFeatureKeySchema,
  enabled: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

export const adminOrgFeatureOverrideDeleteSchema = z.object({
  featureKey: entitlementFeatureKeySchema,
});

export const adminOrgRuntimeFlagOverrideSchema = z.object({
  flagKey: z.string().trim().min(1).max(120),
  enabled: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

export const adminOrgRuntimeFlagOverrideDeleteSchema = z.object({
  flagKey: z.string().trim().min(1).max(120),
});

export const billingModeSchema = z.enum(["automated", "manual"]);
export const creditTypeSchema = z.enum(["unlock", "job"]);
export const creditEntryTypeSchema = z.enum(["grant", "adjust", "expire", "reset"]);

export const adminOrgBillingProfileSchema = z.object({
  billingMode: billingModeSchema,
  customerType: z.string().trim().min(1).max(80),
  unlockCreditsMonthly: z.number().int().min(0),
  jobCreditsMonthly: z.number().int().min(0),
  allowNegativeBalance: z.boolean(),
  notes: z.string().trim().max(1000).optional(),
});

export const adminOrgCreditMutationSchema = z.object({
  creditType: creditTypeSchema,
  entryType: creditEntryTypeSchema,
  delta: z
    .number()
    .int()
    .refine((value) => value !== 0, "delta must not be zero"),
  reason: z.string().trim().min(1).max(500),
  referenceType: z.string().trim().max(100).optional(),
  referenceId: z.string().trim().max(200).optional(),
});

export type UpdateOrganisationInput = z.infer<typeof updateOrganisationSchema>;
export type CreateOrganisationInput = z.infer<typeof createOrganisationSchema>;
export type DeleteOrganisationInput = z.infer<typeof deleteOrganisationSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type BulkInviteCsvInput = z.infer<typeof bulkInviteCsvSchema>;
export type BulkInviteRowInput = z.infer<typeof bulkInviteRowSchema>;
export type AdminInviteUserInput = z.infer<typeof adminInviteUserSchema>;
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
export type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;
export type AgencyClientCreateInput = z.infer<typeof agencyClientCreateSchema>;
export type FitScoreRequestInput = z.infer<typeof fitScoreRequestSchema>;
export type BatchFitScoreInput = z.infer<typeof batchFitScoreSchema>;
export type SelectBlendInput = z.infer<typeof selectBlendSchema>;
export type AdminOrgFeatureOverrideInput = z.infer<typeof adminOrgFeatureOverrideSchema>;
export type AdminOrgFeatureOverrideDeleteInput = z.infer<
  typeof adminOrgFeatureOverrideDeleteSchema
>;
export type AdminOrgRuntimeFlagOverrideInput = z.infer<typeof adminOrgRuntimeFlagOverrideSchema>;
export type AdminOrgRuntimeFlagOverrideDeleteInput = z.infer<
  typeof adminOrgRuntimeFlagOverrideDeleteSchema
>;
export type AdminOrgBillingProfileInput = z.infer<typeof adminOrgBillingProfileSchema>;
export type AdminOrgCreditMutationInput = z.infer<typeof adminOrgCreditMutationSchema>;

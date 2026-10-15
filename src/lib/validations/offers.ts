import { z } from "zod";

const letterVariablesRecordSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.null()]))
  .superRefine((obj, ctx) => {
    if (Object.keys(obj).length > 40) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At most 40 letter variable keys",
        path: [],
      });
    }
  });

export const createOfferSchema = z
  .object({
    applicationId: z.string().uuid(),
    roleTitle: z.string().min(2).max(200),
    startDate: z.string().min(4),
    compensation: z.record(z.string(), z.any()).default({}),
    notes: z.string().max(4000).optional(),
    expiresAt: z.string().datetime().optional(),
    /** B2: optional org offer PDF template; omit to use default. */
    offerPdfTemplateId: z.string().uuid().optional(),
    /** Values for org-defined `{{custom_key}}` tokens on the selected template. */
    letterVariables: letterVariablesRecordSchema.optional(),
    /** B7: optional band to validate `compensation.ctc` against. */
    bandId: z.string().uuid().optional(),
    bandExceptionReason: z.string().max(4000).optional(),
    companySignerName: z.string().min(2).max(200).optional(),
    companySignerEmail: z.string().email().max(320).optional(),
  })
  .superRefine((data, ctx) => {
    const hasName = Boolean(data.companySignerName?.trim());
    const hasEmail = Boolean(data.companySignerEmail?.trim());
    if (hasName !== hasEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide both companySignerName and companySignerEmail, or neither.",
        path: hasName ? ["companySignerEmail"] : ["companySignerName"],
      });
    }
  });

export const patchDraftOfferSchema = z
  .object({
    letterVariables: letterVariablesRecordSchema.optional(),
    compensation: z.record(z.string(), z.any()).optional(),
    roleTitle: z.string().min(2).max(200).optional(),
    startDate: z.string().min(4).optional(),
    notes: z.union([z.string().max(4000), z.null()]).optional(),
    bandId: z.union([z.string().uuid(), z.null()]).optional(),
    bandExceptionReason: z.string().max(4000).optional(),
    companySignerName: z.union([z.string().min(2).max(200), z.null()]).optional(),
    companySignerEmail: z.union([z.string().email().max(320), z.null()]).optional(),
  })
  .superRefine((data, ctx) => {
    const hasNameField = data.companySignerName !== undefined;
    const hasEmailField = data.companySignerEmail !== undefined;
    if (hasNameField !== hasEmailField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Update both companySignerName and companySignerEmail together (or omit both fields).",
        path: hasNameField ? ["companySignerEmail"] : ["companySignerName"],
      });
      return;
    }

    if (
      data.letterVariables === undefined &&
      data.compensation === undefined &&
      data.roleTitle === undefined &&
      data.startDate === undefined &&
      data.notes === undefined &&
      data.bandId === undefined &&
      data.bandExceptionReason === undefined &&
      data.companySignerName === undefined &&
      data.companySignerEmail === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Provide at least one field: letterVariables, compensation, roleTitle, startDate, notes, bandId, bandExceptionReason, companySignerName, or companySignerEmail",
        path: [],
      });
    }
  });

export const financeDecisionSchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    comment: z.string().max(4000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.decision === "rejected" && !(value.comment ?? "").trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "comment is required when rejecting",
        path: ["comment"],
      });
    }
  });

export const offerResponseSchema = z
  .object({
    response: z.enum(["accept", "decline", "counter"]),
    comment: z.string().max(4000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.response === "counter" && !(value.comment ?? "").trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "comment is required when submitting a counter-offer",
        path: ["comment"],
      });
    }
  });

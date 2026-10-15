import { z } from "zod";
import { screeningAnswerItemSchema } from "@/lib/screening/job-screening";
import { REJECT_REASONS } from "@/lib/v2/review-queue";

/**
 * Reject reasons are a closed list, not free text.
 *
 * The reason feeds adverse-impact reporting and decides whether someone stays
 * in the talent pool. Free text cannot be grouped, so a typed reason would make
 * the fairness report look sparse while the rejections kept happening. The list
 * lives in the review queue's state machine; this derives from it rather than
 * restating it, so the two can never disagree about what a valid reason is.
 */
const REJECT_REASON_IDS = REJECT_REASONS.map((r) => r.id) as [string, ...string[]];

export const createApplicationSchema = z.object({
  jobId: z.string().uuid("Valid job ID required"),
  fitScoreId: z.string().uuid("Valid fit score ID required").optional(),
  interest: z.enum(["interested", "strong_interest"]).default("interested"),
  coverNote: z.string().max(2000, "Cover note must be under 2000 characters").optional(),
  source: z.string().max(64).optional(),
  confidentialApply: z.boolean().optional().default(false),
  /** Required when the job has active yes/no screening questions. */
  screeningAnswers: z.array(screeningAnswerItemSchema).optional(),
});

export const updateApplicationSchema = z
  .object({
    status: z.enum(["applied", "viewed", "shortlisted", "rejected", "hired"]).optional(),
    /** Snake_case because the review queue posts the column name directly. */
    rejection_reason: z.enum(REJECT_REASON_IDS).nullable().optional(),
    currentCtcLpa: z.number().nonnegative().nullable().optional(),
    expectedCtcLpa: z.number().nonnegative().nullable().optional(),
    noticePeriodDays: z.number().int().nonnegative().nullable().optional(),
    offersInHand: z.number().int().nonnegative().nullable().optional(),
    availableFrom: z.string().date().nullable().optional(),
    relocationWillingness: z.enum(["yes", "no", "negotiable"]).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    // A reason without a reject would sit on an active application and surface
    // that person in the talent pool as though they had been passed over.
    if (val.rejection_reason && val.status !== "rejected") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rejection_reason"],
        message: "A rejection reason may only be sent with status 'rejected'.",
      });
    }
  });

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;

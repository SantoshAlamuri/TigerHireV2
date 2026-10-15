import { z } from "zod";

const screeningOptionSchema = z.object({
  label: z.string().trim().min(1).max(200),
  knockout: z.boolean().default(false),
});

export const screeningAnswerTypeSchema = z.enum(["yes_no", "single_select"]);

export const createJobScreeningQuestionSchema = z
  .object({
    questionText: z.string().trim().min(1, "Question is required").max(2000),
    failOnYes: z.boolean().default(true),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional().default(true),
    answerType: screeningAnswerTypeSchema.optional().default("yes_no"),
    options: z.array(screeningOptionSchema).min(2).max(10).optional(),
  })
  .strict()
  .refine((d) => d.answerType !== "single_select" || (d.options?.length ?? 0) >= 2, {
    message: "Single-select questions need at least two options.",
    path: ["options"],
  });

export const updateJobScreeningQuestionSchema = z
  .object({
    questionText: z.string().trim().min(1).max(2000).optional(),
    failOnYes: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    answerType: screeningAnswerTypeSchema.optional(),
    options: z.array(screeningOptionSchema).min(2).max(10).nullable().optional(),
  })
  .strict();

export type CreateJobScreeningQuestionInput = z.infer<typeof createJobScreeningQuestionSchema>;
export type UpdateJobScreeningQuestionInput = z.infer<typeof updateJobScreeningQuestionSchema>;

import { z } from "zod";
import { ASSESSMENT_BUILDER_TYPES, ASSESSMENT_SHARE_CHANNELS } from "@/lib/assessments/constants";

export const createAssessmentSchema = z
  .object({
    applicationId: z.string().uuid(),
    stageId: z.string().uuid().optional(),
    type: z.enum(ASSESSMENT_BUILDER_TYPES),
    title: z.string().min(2).max(200),
    instructions: z.string().max(250000).optional(),
    deadlineAt: z.string().datetime(),
    reviewerId: z.string().uuid().optional(),
    passThresholdPct: z.number().min(0).max(100).optional(),
    autoAdvance: z.boolean().optional(),
    externalPlatform: z.string().max(100).optional(),
    webhookUrl: z.string().url().optional(),
    shareChannels: z.array(z.enum(ASSESSMENT_SHARE_CHANNELS)).optional(),
    recipientEmail: z.string().email().optional(),
    recipientPhone: z.string().min(8).max(20).optional(),
  })
  .strict();

export const submitAssessmentSchema = z
  .object({
    submissionText: z.string().max(20000).optional(),
    submissionUrl: z.string().url().optional(),
  })
  .strict()
  .refine((data) => Boolean(data.submissionText || data.submissionUrl), {
    message: "Either submissionText or submissionUrl is required",
  });

export const scoreAssessmentSchema = z
  .object({
    score: z.number().min(0),
    maxScore: z.number().min(1),
    feedback: z.string().max(20000).optional(),
  })
  .strict();

import { z } from "zod";

export const interviewPrepTemplateSchema = z
  .object({
    title: z.string().min(2).max(120),
    whenToUse: z.string().min(10).max(500),
    objective: z.string().min(10).max(1000),
    roleFunction: z.string().max(120).nullable().optional(),
    stageName: z.string().max(120).nullable().optional(),
    questionTracks: z.array(z.string().min(3).max(300)).min(1).max(10),
    rubric: z.array(z.string().min(2).max(120)).min(1).max(8),
  })
  .strict();

export const updateInterviewPrepTemplateSchema = interviewPrepTemplateSchema.partial();

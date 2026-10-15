import { z } from "zod";

export const SUPPORT_REQUEST_CATEGORIES = [
  "billing",
  "onboarding",
  "access",
  "reliability",
  "general",
] as const;

export const SUPPORT_REQUEST_PRIORITIES = ["p1", "p2", "p3", "p4"] as const;
export const SUPPORT_REQUEST_STATUSES = ["open", "in_progress", "resolved", "cancelled"] as const;

export const createSupportRequestSchema = z.object({
  category: z.enum(SUPPORT_REQUEST_CATEGORIES),
  priority: z.enum(SUPPORT_REQUEST_PRIORITIES).default("p3"),
  subject: z.string().trim().min(5, "Subject is too short").max(160),
  description: z.string().trim().min(10, "Description is too short").max(4000),
  contextPath: z.string().trim().max(300).optional(),
});

export const updateSupportRequestSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(SUPPORT_REQUEST_STATUSES).optional(),
    assigneeUserId: z.string().uuid().nullable().optional(),
    ownerTeam: z.string().trim().min(2).max(80).optional(),
    resolutionNotes: z.string().trim().max(2000).optional(),
  })
  .refine(
    (v) =>
      v.status !== undefined ||
      v.assigneeUserId !== undefined ||
      v.ownerTeam !== undefined ||
      v.resolutionNotes !== undefined,
    {
      message: "At least one field must be updated",
      path: ["status"],
    },
  );

export const submitSupportFeedbackSchema = z.object({
  id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional().default(""),
});

export type CreateSupportRequestInput = z.infer<typeof createSupportRequestSchema>;
export type UpdateSupportRequestInput = z.infer<typeof updateSupportRequestSchema>;
export type SubmitSupportFeedbackInput = z.infer<typeof submitSupportFeedbackSchema>;

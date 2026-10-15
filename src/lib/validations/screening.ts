import { z } from "zod";

export const screeningModeSchema = z.enum(["voice", "whatsapp", "manual", "none"]);
export const screeningDefaultModeSchema = z.enum(["off", "whatsapp", "voice"]);
export const screeningTriggeredBySchema = z.enum(["auto", "recruiter_manual"]);

const hhmmTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Expected HH:MM in 24-hour format");

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map((part) => Number(part));
  return hours * 60 + minutes;
}

export const screeningTriggerSchema = z
  .object({
    candidate_id: z.string().uuid(),
    req_id: z.string().uuid(),
    mode: screeningModeSchema.optional(),
    triggered_by: screeningTriggeredBySchema.default("auto"),
    recruiter_id: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.triggered_by === "recruiter_manual" && !value.recruiter_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "recruiter_id is required when triggered_by is recruiter_manual",
        path: ["recruiter_id"],
      });
    }
  });

export const screeningOverrideSchema = z
  .object({
    job_id: z.string().uuid(),
    new_mode: screeningModeSchema,
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

const screeningSettingsBaseSchema = z.object({
  screening_default_mode: screeningDefaultModeSchema,
  voice_screening_enabled: z.boolean(),
  voice_screening_free_credits_per_month: z.number().int().min(0).max(1000),
  voice_screening_monthly_cap_inr: z.number().min(0).max(99999999).nullable(),
  screening_fitscore_threshold: z.number().int().min(0).max(100),
  screening_calling_hours_start: hhmmTimeSchema,
  screening_calling_hours_end: hhmmTimeSchema,
  screening_auto_trigger: z.boolean(),
  notetaker_enabled: z.boolean(),
  notetaker_monthly_cap_inr: z.number().min(0).max(99999999).nullable(),
});

export const screeningSettingsSchema = screeningSettingsBaseSchema
  .strict()
  .superRefine((value, ctx) => {
    if (
      toMinutes(value.screening_calling_hours_start) >= toMinutes(value.screening_calling_hours_end)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "screening_calling_hours_end must be later than screening_calling_hours_start",
        path: ["screening_calling_hours_end"],
      });
    }
  });

export const patchScreeningSettingsSchema = screeningSettingsBaseSchema
  .partial()
  .strict()
  .superRefine((value, ctx) => {
    if (!value.screening_calling_hours_start || !value.screening_calling_hours_end) return;
    if (
      toMinutes(value.screening_calling_hours_start) >= toMinutes(value.screening_calling_hours_end)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "screening_calling_hours_end must be later than screening_calling_hours_start",
        path: ["screening_calling_hours_end"],
      });
    }
  });

export type ScreeningMode = z.infer<typeof screeningModeSchema>;
export type ScreeningDefaultMode = z.infer<typeof screeningDefaultModeSchema>;
export type ScreeningTriggerInput = z.infer<typeof screeningTriggerSchema>;
export type ScreeningOverrideInput = z.infer<typeof screeningOverrideSchema>;
export type ScreeningSettingsInput = z.infer<typeof screeningSettingsSchema>;
export type PatchScreeningSettingsInput = z.infer<typeof patchScreeningSettingsSchema>;

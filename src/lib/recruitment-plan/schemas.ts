import { z } from "zod";
import {
  PLAN_APPROVAL_GATES,
  PLAN_STAGE_FORMATS,
  PLAN_STAGE_TYPES,
  RECRUITMENT_PLAN_STATUSES,
} from "./types";

export const recruitmentPlanPatchSchema = z
  .object({
    status: z.enum(RECRUITMENT_PLAN_STATUSES).optional(),
    target_days_to_fill: z.number().int().min(1).max(365).optional(),
  })
  .strict();

export const planStageWriteSchema = z
  .object({
    id: z.string().uuid().optional(),
    pipeline_stage_id: z.string().uuid().nullable().optional(),
    stage_order: z.number().int().min(0),
    stage_type: z.enum(PLAN_STAGE_TYPES),
    display_name: z.string().min(1).max(100),
    primary_interviewer_id: z.string().uuid().nullable().optional(),
    backup_interviewer_id: z.string().uuid().nullable().optional(),
    duration_minutes: z.number().int().min(15).max(240).nullable().optional(),
    format: z.enum(PLAN_STAGE_FORMATS).nullable().optional(),
    scorecard_template_id: z.string().uuid().nullable().optional(),
    comms_template_id: z.string().max(200).nullable().optional(),
    comms_template: z.string().max(200).nullable().optional(),
    approval_gate: z.enum(PLAN_APPROVAL_GATES).optional(),
    target_dwell_days: z.number().int().min(0).max(365).optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

export const planStagesUpsertSchema = z
  .object({
    stages: z.array(planStageWriteSchema).min(1).max(30),
  })
  .strict();

export const planHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

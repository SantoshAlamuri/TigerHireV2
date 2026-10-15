import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { DEFAULT_PLAN_STAGES, type DefaultPlanStageInput } from "./default-plan-stages";
import { PLAN_APPROVAL_GATES, PLAN_STAGE_FORMATS, PLAN_STAGE_TYPES } from "./types";

export type OrgDefaultPlanStage = DefaultPlanStageInput & {
  primary_interviewer_id?: string | null;
};

const stageSchema = z.object({
  stage_order: z.number().int().min(0).max(50),
  stage_type: z.enum(PLAN_STAGE_TYPES),
  display_name: z.string().min(1).max(120),
  target_dwell_days: z.number().int().min(0).max(365),
  duration_minutes: z.number().int().min(0).max(480).optional(),
  format: z.enum(PLAN_STAGE_FORMATS).optional(),
  approval_gate: z.enum(PLAN_APPROVAL_GATES).optional(),
  primary_interviewer_id: z.string().uuid().nullable().optional(),
});

export const orgDefaultPlanStagesSchema = z.array(stageSchema).min(1).max(20);

export function builtinDefaultPlanStages(): OrgDefaultPlanStage[] {
  return DEFAULT_PLAN_STAGES.map((s) => ({ ...s, primary_interviewer_id: null }));
}

export async function getOrgDefaultRecruitmentPlanStages(
  admin: SupabaseClient,
  organisationId: string,
): Promise<OrgDefaultPlanStage[] | null> {
  const { data, error } = await admin
    .from("organisations")
    .select("default_recruitment_plan_stages")
    .eq("id", organisationId)
    .maybeSingle();

  if (error || !data?.default_recruitment_plan_stages) return null;
  const parsed = orgDefaultPlanStagesSchema.safeParse(data.default_recruitment_plan_stages);
  if (!parsed.success) return null;
  return parsed.data;
}

export async function saveOrgDefaultRecruitmentPlanStages(
  admin: SupabaseClient,
  organisationId: string,
  stages: OrgDefaultPlanStage[],
): Promise<{ ok: boolean; error: Error | null }> {
  const parsed = orgDefaultPlanStagesSchema.safeParse(stages);
  if (!parsed.success) {
    return { ok: false, error: new Error(parsed.error.message) };
  }

  const { error } = await admin
    .from("organisations")
    .update({ default_recruitment_plan_stages: parsed.data })
    .eq("id", organisationId);

  if (error) return { ok: false, error: new Error(error.message) };
  return { ok: true, error: null };
}

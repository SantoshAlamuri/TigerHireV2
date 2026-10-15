import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import {
  builtinDefaultPlanStages,
  getOrgDefaultRecruitmentPlanStages,
} from "./org-default-plan-stages";
import { inferPlanStageType } from "./infer-stage-type";
import type {
  PlanHistoryRow,
  PlanStageRow,
  RecruitmentPlanRow,
  RecruitmentPlanStatus,
} from "./types";

const PLAN_SELECT =
  "id, organisation_id, job_id, status, target_days_to_fill, created_at, activated_at, created_by, updated_at";

const STAGE_SELECT =
  "id, plan_id, pipeline_stage_id, stage_order, stage_type, display_name, primary_interviewer_id, backup_interviewer_id, duration_minutes, format, scorecard_template_id, comms_template_id, comms_template, approval_gate, target_dwell_days, is_active, created_at";

function planStatusFromJobStatus(jobStatus: string | null | undefined): RecruitmentPlanStatus {
  const s = String(jobStatus ?? "").toLowerCase();
  if (s === "open" || s === "active") return "active";
  if (s === "closed" || s === "filled") return "completed";
  if (s === "paused") return "paused";
  if (s === "archived") return "archived";
  return "draft";
}

export async function getRecruitmentPlanByJobId(
  client: SupabaseClient,
  jobId: string,
): Promise<{ plan: RecruitmentPlanRow | null; error: Error | null }> {
  const { data, error } = await client
    .from("recruitment_plans")
    .select(PLAN_SELECT)
    .eq("job_id", jobId)
    .maybeSingle();

  if (error) return { plan: null, error: new Error(error.message) };
  return { plan: (data as RecruitmentPlanRow | null) ?? null, error: null };
}

export async function listPlanStages(
  client: SupabaseClient,
  planId: string,
): Promise<{ stages: PlanStageRow[]; error: Error | null }> {
  const { data, error } = await client
    .from("plan_stages")
    .select(STAGE_SELECT)
    .eq("plan_id", planId)
    .eq("is_active", true)
    .order("stage_order", { ascending: true });

  if (error) return { stages: [], error: new Error(error.message) };
  return { stages: (data ?? []) as PlanStageRow[], error: null };
}

export async function listPlanHistory(
  client: SupabaseClient,
  planId: string,
  opts?: { limit?: number; offset?: number },
): Promise<{ history: PlanHistoryRow[]; error: Error | null }> {
  const limit = Math.min(opts?.limit ?? 20, 100);
  const offset = opts?.offset ?? 0;
  const { data, error } = await client
    .from("plan_history")
    .select(
      "id, plan_id, candidate_id, actor_type, actor_user_id, event_type, event_summary, details, created_at",
    )
    .eq("plan_id", planId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return { history: [], error: new Error(error.message) };
  return { history: (data ?? []) as PlanHistoryRow[], error: null };
}

export async function appendPlanHistory(
  admin: SupabaseClient,
  entry: {
    plan_id: string;
    candidate_id?: string | null;
    actor_type: "human" | "system" | "agent";
    actor_user_id?: string | null;
    event_type: string;
    event_summary: string;
    details?: Record<string, unknown> | null;
  },
): Promise<{ ok: boolean; error: Error | null }> {
  const { error } = await admin.from("plan_history").insert({
    plan_id: entry.plan_id,
    candidate_id: entry.candidate_id ?? null,
    actor_type: entry.actor_type,
    actor_user_id: entry.actor_user_id ?? null,
    event_type: entry.event_type,
    event_summary: entry.event_summary,
    details: entry.details ?? null,
  });
  if (error) return { ok: false, error: new Error(error.message) };
  return { ok: true, error: null };
}

type PipelineStageSource = {
  id: string;
  stage_name: string;
  stage_order: number;
  stage_type?: string | null;
  interviewer_user_id?: string | null;
  feedback_template_id?: string | null;
  sla_days?: number | null;
};

async function stagesFromPipeline(
  admin: SupabaseClient,
  jobId: string,
): Promise<PipelineStageSource[]> {
  const { data, error } = await admin
    .from("pipeline_stages")
    .select("id, stage_name, stage_order, stage_type, interviewer_user_id, sla_days")
    .eq("job_id", jobId)
    .order("stage_order", { ascending: true });

  if (error) {
    logger.warn("recruitment-plan: pipeline_stages read failed", {
      jobId,
      error: error.message,
    });
    return [];
  }
  return (data ?? []) as PipelineStageSource[];
}

function pipelineStageToPlanInsert(
  planId: string,
  row: PipelineStageSource,
): Record<string, unknown> {
  return {
    plan_id: planId,
    pipeline_stage_id: row.id,
    stage_order: row.stage_order,
    stage_type: inferPlanStageType({
      stageName: row.stage_name,
      pipelineStageType: row.stage_type,
    }),
    display_name: row.stage_name,
    primary_interviewer_id: row.interviewer_user_id ?? null,
    backup_interviewer_id: null,
    duration_minutes: null,
    format: null,
    scorecard_template_id: null,
    comms_template_id: null,
    approval_gate: "none",
    target_dwell_days: row.sla_days ?? 5,
    is_active: true,
  };
}

/**
 * Ensure a recruitment plan exists for the job; seed stages from pipeline_stages or defaults.
 */
export async function ensureRecruitmentPlanForJob(input: {
  jobId: string;
  organisationId: string;
  jobStatus?: string | null;
  createdBy: string;
}): Promise<{
  plan: RecruitmentPlanRow;
  stages: PlanStageRow[];
  created: boolean;
  error: Error | null;
}> {
  const admin = createSupabaseAdmin();
  const existing = await getRecruitmentPlanByJobId(admin, input.jobId);
  if (existing.error) return { plan: null!, stages: [], created: false, error: existing.error };

  if (existing.plan) {
    const listed = await listPlanStages(admin, existing.plan.id);
    return {
      plan: existing.plan,
      stages: listed.stages,
      created: false,
      error: listed.error,
    };
  }

  const status = planStatusFromJobStatus(input.jobStatus);
  const now = new Date().toISOString();
  const { data: planRow, error: planErr } = await admin
    .from("recruitment_plans")
    .insert({
      organisation_id: input.organisationId,
      job_id: input.jobId,
      status,
      target_days_to_fill: 30,
      created_by: input.createdBy,
      activated_at: status === "active" ? now : null,
      updated_at: now,
    })
    .select(PLAN_SELECT)
    .single();

  if (planErr || !planRow) {
    return {
      plan: null!,
      stages: [],
      created: false,
      error: new Error(planErr?.message ?? "Failed to create recruitment plan"),
    };
  }

  const plan = planRow as RecruitmentPlanRow;
  const pipelineStages = await stagesFromPipeline(admin, input.jobId);
  const orgDefaults = await getOrgDefaultRecruitmentPlanStages(admin, input.organisationId);
  const templateStages = orgDefaults ?? builtinDefaultPlanStages();
  const stagePayloads =
    pipelineStages.length > 0
      ? pipelineStages.map((s) => pipelineStageToPlanInsert(plan.id, s))
      : templateStages.map((s) => ({
          plan_id: plan.id,
          pipeline_stage_id: null,
          stage_order: s.stage_order,
          stage_type: s.stage_type,
          display_name: s.display_name,
          primary_interviewer_id: s.primary_interviewer_id ?? null,
          backup_interviewer_id: null,
          duration_minutes: s.duration_minutes ?? null,
          format: s.format ?? null,
          scorecard_template_id: null,
          comms_template_id: null,
          approval_gate: s.approval_gate ?? "none",
          target_dwell_days: s.target_dwell_days,
          is_active: true,
        }));

  const { error: stagesErr } = await admin.from("plan_stages").insert(stagePayloads);
  if (stagesErr) {
    return { plan, stages: [], created: true, error: new Error(stagesErr.message) };
  }

  await appendPlanHistory(admin, {
    plan_id: plan.id,
    actor_type: "system",
    event_type: "plan_created",
    event_summary: "Recruitment plan created",
    details: {
      source:
        pipelineStages.length > 0
          ? "pipeline_stages"
          : orgDefaults
            ? "org_default_template"
            : "default_template",
    },
  });

  const listed = await listPlanStages(admin, plan.id);
  return { plan, stages: listed.stages, created: true, error: listed.error };
}

export async function updateRecruitmentPlan(
  admin: SupabaseClient,
  planId: string,
  patch: {
    status?: RecruitmentPlanStatus;
    target_days_to_fill?: number;
  },
): Promise<{ plan: RecruitmentPlanRow | null; error: Error | null }> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) {
    payload.status = patch.status;
    if (patch.status === "active" && !payload.activated_at) {
      payload.activated_at = new Date().toISOString();
    }
  }
  if (patch.target_days_to_fill !== undefined) {
    payload.target_days_to_fill = patch.target_days_to_fill;
  }

  const { data, error } = await admin
    .from("recruitment_plans")
    .update(payload)
    .eq("id", planId)
    .select(PLAN_SELECT)
    .single();

  if (error) return { plan: null, error: new Error(error.message) };
  return { plan: data as RecruitmentPlanRow, error: null };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import { isLockedSystemStageName } from "@/lib/pipeline/stage-types";
import { linkPlanStagesToPipeline } from "./link-plan-stages-to-pipeline";
import { listPlanStages } from "./repository";
import type { PlanStageRow } from "./types";

type PipelineStageRow = {
  id: string;
  stage_name: string;
  stage_order: number;
  stage_type: string | null;
  is_locked: boolean;
};

/** Map plan stage_type to pipeline stage_type enum. */
export function planStageTypeToPipelineType(stageType: string): string {
  switch (stageType) {
    case "phone_screen":
      return "screening";
    case "interview":
      return "interview";
    case "assessment":
      return "assessment";
    case "offer":
      return "offer";
    default:
      return "screening";
  }
}

async function resolveInterviewerFields(
  admin: SupabaseClient,
  organisationId: string,
  primaryInterviewerId: string | null,
): Promise<{
  interviewer_user_id: string | null;
  interviewer_email: string | null;
  interviewer_name: string | null;
}> {
  const uid = (primaryInterviewerId ?? "").trim();
  if (!uid) {
    return { interviewer_user_id: null, interviewer_email: null, interviewer_name: null };
  }
  const { data: pr } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", uid)
    .eq("organisation_id", organisationId)
    .maybeSingle();
  return {
    interviewer_user_id: uid,
    interviewer_email: (pr?.email as string | null) ?? null,
    interviewer_name: (pr?.full_name as string | null) ?? null,
  };
}

/**
 * One-way write-through: when plan stages are saved, keep linked pipeline_stages
 * in sync (Option A — stable pipeline_stage_id FK).
 */
export async function syncPlanStagesToPipeline(
  admin: SupabaseClient,
  params: {
    jobId: string;
    organisationId: string;
    planId: string;
    stages: PlanStageRow[];
  },
): Promise<{ linked: number; updated: number; created: number }> {
  const { jobId, organisationId, planId, stages } = params;
  const activeStages = stages.filter((s) => s.is_active);
  let updated = 0;
  let created = 0;

  const { data: pipelineRows, error: readErr } = await admin
    .from("pipeline_stages")
    .select("id, stage_name, stage_order, stage_type, is_locked")
    .eq("job_id", jobId);

  if (readErr) {
    logger.warn("syncPlanStagesToPipeline: pipeline read failed", {
      jobId,
      error: readErr.message,
    });
    return { linked: 0, updated, created };
  }

  const pipelineById = new Map(
    (pipelineRows ?? []).map((r) => [r.id as string, r as PipelineStageRow]),
  );

  for (const planStage of activeStages) {
    const interviewer = await resolveInterviewerFields(
      admin,
      organisationId,
      planStage.primary_interviewer_id,
    );

    const sharedFields = {
      sla_days: planStage.target_dwell_days ?? null,
      feedback_template_id: planStage.scorecard_template_id ?? null,
      interviewer_user_id: interviewer.interviewer_user_id,
      interviewer_email: interviewer.interviewer_email,
      interviewer_name: interviewer.interviewer_name,
    };

    if (planStage.pipeline_stage_id) {
      const existing = pipelineById.get(planStage.pipeline_stage_id);
      if (!existing) {
        logger.warn("syncPlanStagesToPipeline: FK points to missing pipeline stage", {
          planStageId: planStage.id,
          pipelineStageId: planStage.pipeline_stage_id,
        });
        continue;
      }

      if (existing.is_locked || isLockedSystemStageName(existing.stage_name)) {
        const { error: lockErr } = await admin
          .from("pipeline_stages")
          .update({ ...sharedFields })
          .eq("id", existing.id)
          .eq("job_id", jobId);
        if (lockErr) {
          logger.warn("syncPlanStagesToPipeline: locked stage update failed", {
            error: lockErr.message,
            pipelineStageId: existing.id,
          });
        } else {
          updated += 1;
        }
        continue;
      }

      const { error: upErr } = await admin
        .from("pipeline_stages")
        .update({
          stage_name: planStage.display_name,
          stage_order: planStage.stage_order,
          stage_type: planStageTypeToPipelineType(planStage.stage_type),
          ...sharedFields,
        })
        .eq("id", existing.id)
        .eq("job_id", jobId);

      if (upErr) {
        logger.warn("syncPlanStagesToPipeline: update failed", {
          error: upErr.message,
          pipelineStageId: existing.id,
        });
      } else {
        updated += 1;
      }
      continue;
    }

    const { data: inserted, error: insErr } = await admin
      .from("pipeline_stages")
      .insert({
        job_id: jobId,
        stage_name: planStage.display_name,
        stage_order: planStage.stage_order,
        stage_type: planStageTypeToPipelineType(planStage.stage_type),
        is_locked: false,
        notify_candidate: false,
        color: "#6366f1",
        ...sharedFields,
      })
      .select("id")
      .single();

    if (insErr || !inserted?.id) {
      logger.warn("syncPlanStagesToPipeline: insert failed", {
        error: insErr?.message,
        planStageId: planStage.id,
      });
      continue;
    }

    const { error: linkErr } = await admin
      .from("plan_stages")
      .update({ pipeline_stage_id: inserted.id as string })
      .eq("id", planStage.id)
      .eq("plan_id", planId);

    if (linkErr) {
      logger.warn("syncPlanStagesToPipeline: plan FK link failed", {
        error: linkErr.message,
        planStageId: planStage.id,
      });
    } else {
      planStage.pipeline_stage_id = inserted.id as string;
      created += 1;
    }
  }

  const refreshed = await listPlanStages(admin, planId);
  const stagesForLink = refreshed.error ? stages : refreshed.stages;
  const { linked } = await linkPlanStagesToPipeline(admin, jobId, planId, stagesForLink);

  return { linked, updated, created };
}

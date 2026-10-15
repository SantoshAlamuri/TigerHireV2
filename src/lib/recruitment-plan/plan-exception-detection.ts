import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotification } from "@/lib/services/notifications";
import { logger } from "@/lib/observability/logger";
import { isPlanAutoExecuteEnabled } from "./plan-auto-execute-flags";
import { logPlanSystemEvent } from "./plan-history-log";

type StuckRow = {
  tracking_id: string;
  plan_id: string;
  plan_stage_id: string;
  pipeline_candidate_id: string;
  candidate_id: string;
  job_id: string;
  organisation_id: string;
  entered_at: string;
  target_dwell_days: number;
  display_name: string;
  stage_type: string;
  primary_interviewer_id: string | null;
  job_title: string;
  candidate_name: string | null;
  hiring_manager_id: string | null;
  created_by: string | null;
};

export async function runPlanExceptionDetection(
  admin: SupabaseClient,
): Promise<{ detected: number; nudged: number }> {
  if (!isPlanAutoExecuteEnabled()) {
    return { detected: 0, nudged: 0 };
  }

  const { data: orgPlans } = await admin
    .from("recruitment_plans")
    .select("id, organisation_id, created_by, job_id, jobs!inner(title, hiring_manager_id)")
    .in("status", ["active", "draft", "paused"]);

  const planIds = (orgPlans ?? []).map((p) => p.id as string);
  if (planIds.length === 0) return { detected: 0, nudged: 0 };

  const { data: trackingRows, error } = await admin
    .from("plan_candidate_stage_tracking")
    .select(
      `id, plan_id, plan_stage_id, pipeline_candidate_id, candidate_id, job_id, entered_at, exception_detected_at,
       plan_stages!inner(target_dwell_days, display_name, stage_type, primary_interviewer_id),
       candidates(name, full_name),
       pipeline_candidates!inner(status, interview_scheduled_at)`,
    )
    .in("plan_id", planIds)
    .is("exception_detected_at", null);

  if (error) {
    logger.error("plan exception detection query failed", { error: error.message });
    return { detected: 0, nudged: 0 };
  }

  const now = Date.now();
  let detected = 0;
  let nudged = 0;

  for (const raw of trackingRows ?? []) {
    const row = raw as Record<string, unknown>;
    const pc = row.pipeline_candidates as {
      status?: string;
      interview_scheduled_at?: string | null;
    } | null;
    if (pc?.status === "rejected" || pc?.status === "hired") continue;

    const planStage = row.plan_stages as {
      target_dwell_days: number;
      display_name: string;
      stage_type: string;
      primary_interviewer_id: string | null;
    };
    const enteredAt = new Date(row.entered_at as string).getTime();
    const dwellMs = (planStage.target_dwell_days ?? 5) * 86400000;
    if (now - enteredAt < dwellMs) continue;

    if (planStage.stage_type === "interview" && pc?.interview_scheduled_at) continue;

    const planMeta = (orgPlans ?? []).find((p) => p.id === row.plan_id) as
      | {
          organisation_id: string;
          created_by: string | null;
          jobs: { title: string; hiring_manager_id: string | null };
        }
      | undefined;
    if (!planMeta) continue;
    const jobs = planMeta.jobs as { title: string; hiring_manager_id: string | null };
    const candidate = row.candidates as { name?: string; full_name?: string } | null;
    const daysStuck = Math.floor((now - enteredAt) / 86400000);

    const stuck: StuckRow = {
      tracking_id: row.id as string,
      plan_id: row.plan_id as string,
      plan_stage_id: row.plan_stage_id as string,
      pipeline_candidate_id: row.pipeline_candidate_id as string,
      candidate_id: row.candidate_id as string,
      job_id: row.job_id as string,
      organisation_id: planMeta.organisation_id as string,
      entered_at: row.entered_at as string,
      target_dwell_days: planStage.target_dwell_days,
      display_name: planStage.display_name,
      stage_type: planStage.stage_type,
      primary_interviewer_id: planStage.primary_interviewer_id,
      job_title: jobs.title,
      candidate_name: candidate?.full_name ?? candidate?.name ?? null,
      hiring_manager_id: jobs.hiring_manager_id,
      created_by: planMeta.created_by as string | null,
    };

    detected += 1;
    const detectedAt = new Date().toISOString();

    await admin
      .from("plan_candidate_stage_tracking")
      .update({ exception_detected_at: detectedAt })
      .eq("id", stuck.tracking_id);

    await logPlanSystemEvent(admin, {
      planId: stuck.plan_id,
      candidateId: stuck.candidate_id,
      eventType: "exception_detected",
      description: `${stuck.candidate_name ?? "Candidate"} stuck in ${stuck.display_name} for ${daysStuck} days`,
      details: {
        planStageId: stuck.plan_stage_id,
        daysStuck,
        targetDwellDays: stuck.target_dwell_days,
        jobTitle: stuck.job_title,
      },
    });

    const nudgeUserId = stuck.primary_interviewer_id ?? stuck.created_by ?? stuck.hiring_manager_id;
    if (!nudgeUserId) continue;

    const link = `/recruit/jobs/${stuck.job_id}`;
    const ok = await createNotification({
      userId: nudgeUserId,
      type: "general",
      title: `Plan exception: ${stuck.display_name}`,
      body: `${stuck.candidate_name ?? "A candidate"} has been in ${stuck.display_name} on ${stuck.job_title} for ${daysStuck} days (target ${stuck.target_dwell_days}d).`,
      link,
      metadata: {
        plan_id: stuck.plan_id,
        pipeline_candidate_id: stuck.pipeline_candidate_id,
      },
    });

    if (ok) {
      nudged += 1;
      await admin
        .from("plan_candidate_stage_tracking")
        .update({ exception_nudged_at: new Date().toISOString() })
        .eq("id", stuck.tracking_id);

      await logPlanSystemEvent(admin, {
        planId: stuck.plan_id,
        candidateId: stuck.candidate_id,
        eventType: "nudge_sent",
        description: `Nudge sent to stage owner for ${stuck.display_name}`,
        details: {
          targetUserId: nudgeUserId,
          reason: "dwell_exceeded",
          daysStuck,
        },
      });
    }
  }

  return { detected, nudged };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { triggerSchedulerAgent } from "@/lib/agents/scheduler";
import { listUserAvailabilityWindows } from "@/lib/interviews/interviewer-availability";
import { resolvePickerSlotOptions } from "@/lib/interviews/picker-slot-options";
import { logger } from "@/lib/observability/logger";
import { sendEmail } from "@/lib/services/resend";
import { sendTemplateMessage } from "@/lib/services/whatsapp";
import { isPlanAutoExecuteEnabled } from "./plan-auto-execute-flags";
import { logPlanSystemEvent } from "./plan-history-log";
import { resolvePlanStageForPipelineStage } from "./resolve-plan-stage-for-pipeline";
import type { PlanStageRow } from "./types";

function resolveCommsTemplate(stage: PlanStageRow): string | null {
  const raw = stage.comms_template ?? stage.comms_template_id;
  const trimmed = raw?.trim();
  return trimmed || null;
}

async function upsertStageTracking(
  admin: SupabaseClient,
  params: {
    planId: string;
    planStageId: string;
    pipelineCandidateId: string;
    candidateId: string;
    jobId: string;
  },
): Promise<void> {
  const { error } = await admin.from("plan_candidate_stage_tracking").upsert(
    {
      plan_id: params.planId,
      plan_stage_id: params.planStageId,
      pipeline_candidate_id: params.pipelineCandidateId,
      candidate_id: params.candidateId,
      job_id: params.jobId,
      entered_at: new Date().toISOString(),
      exception_detected_at: null,
      exception_nudged_at: null,
    },
    { onConflict: "pipeline_candidate_id,plan_stage_id" },
  );
  if (error) {
    logger.warn("plan_candidate_stage_tracking upsert failed", { error: error.message });
  }
}

async function syncPipelineInterviewerFromPlan(
  admin: SupabaseClient,
  pipelineStageId: string,
  interviewerUserId: string,
): Promise<void> {
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", interviewerUserId)
    .maybeSingle();

  await admin
    .from("pipeline_stages")
    .update({
      interviewer_user_id: interviewerUserId,
      interviewer_email: (profile?.email as string | null) ?? null,
      interviewer_name: (profile?.full_name as string | null) ?? null,
    })
    .eq("id", pipelineStageId);
}

async function sendPlanStageComms(
  admin: SupabaseClient,
  params: {
    planId: string;
    candidateId: string;
    jobId: string;
    organisationId: string;
    planStage: PlanStageRow;
    pipelineStageName: string;
  },
): Promise<void> {
  const template = resolveCommsTemplate(params.planStage);
  if (!template) return;

  const { data: cand } = await admin
    .from("candidates")
    .select("phone, email, name, full_name")
    .eq("id", params.candidateId)
    .maybeSingle();
  if (!cand?.phone && !cand?.email) return;

  const { data: jobRow } = await admin
    .from("jobs")
    .select("title")
    .eq("id", params.jobId)
    .maybeSingle();

  const { data: app } = await admin
    .from("applications")
    .select("id")
    .eq("job_id", params.jobId)
    .eq("candidate_id", params.candidateId)
    .maybeSingle();

  const candidateName = (cand.full_name ?? cand.name ?? "there").split(" ")[0] ?? "there";
  const jobTitle = (jobRow?.title as string | null)?.trim() || "the role";

  if (!template.startsWith("th_")) {
    const email = (cand.email as string | null)?.trim();
    if (!email) {
      logger.info("Plan comms: email template skipped (no candidate email)", {
        template,
        planStageId: params.planStage.id,
      });
      return;
    }
    try {
      await sendEmail({
        to: email,
        subject: `Update on ${jobTitle}`,
        html: `<p>Hi ${candidateName},</p><p>You have moved to the <strong>${params.pipelineStageName}</strong> stage for <strong>${jobTitle}</strong>.</p><p>— TigerHire</p>`,
      });
      await logPlanSystemEvent(admin, {
        planId: params.planId,
        candidateId: params.candidateId,
        eventType: "comms_sent",
        description: `Email sent for ${params.planStage.display_name}`,
        details: {
          template,
          channel: "email",
          stage: params.planStage.display_name,
        },
      });
    } catch (err) {
      logger.warn("Plan comms email send error", {
        error: err instanceof Error ? err.message : String(err),
        template,
      });
    }
    return;
  }

  if (!cand?.phone) return;

  try {
    const result = await sendTemplateMessage({
      phoneNumber: cand.phone as string,
      templateName: template,
      languageCode: "en",
      applicationId: app?.id as string | undefined,
      bodyParams: [candidateName, jobTitle, params.pipelineStageName],
    });

    if (result.success) {
      await logPlanSystemEvent(admin, {
        planId: params.planId,
        candidateId: params.candidateId,
        eventType: "comms_sent",
        description: `WhatsApp template "${template}" sent for ${params.planStage.display_name}`,
        details: {
          template,
          channel: "whatsapp",
          stage: params.planStage.display_name,
        },
      });
    } else {
      logger.warn("Plan comms template send failed", {
        template,
        error: result.error,
        candidateId: params.candidateId,
      });
    }
  } catch (err) {
    logger.warn("Plan comms send error", {
      error: err instanceof Error ? err.message : String(err),
      template,
    });
  }
}

async function runInterviewSlotPicker(
  admin: SupabaseClient,
  params: {
    planId: string;
    candidateId: string;
    jobId: string;
    organisationId: string;
    pipelineStageId: string;
    planStage: PlanStageRow;
    initiatedBy?: string | null;
  },
): Promise<void> {
  if (params.planStage.stage_type !== "interview") return;
  const interviewerId = params.planStage.primary_interviewer_id;
  if (!interviewerId) return;

  await syncPipelineInterviewerFromPlan(admin, params.pipelineStageId, interviewerId);

  const windows = await listUserAvailabilityWindows(admin, {
    userId: interviewerId,
    organisationId: params.organisationId,
    activeOnly: true,
  });

  if (windows.length === 0) {
    logger.warn("Plan auto-execute: no interviewer availability windows", {
      jobId: params.jobId,
      interviewerId,
      planStageId: params.planStage.id,
    });
    return;
  }

  const options = await resolvePickerSlotOptions(admin, {
    jobId: params.jobId,
    organisationId: params.organisationId,
    stageId: params.pipelineStageId,
    interviewerUserId: interviewerId,
  });

  if (options.length === 0) {
    logger.warn("Plan auto-execute: no slot options generated", {
      jobId: params.jobId,
      interviewerId,
    });
    return;
  }

  const result = await triggerSchedulerAgent({
    candidateId: params.candidateId,
    jobId: params.jobId,
    stageId: params.pipelineStageId,
    initiatedBy: params.initiatedBy ?? null,
  });

  if (result.status === "scheduled") {
    await logPlanSystemEvent(admin, {
      planId: params.planId,
      candidateId: params.candidateId,
      eventType: "slot_picker_triggered",
      description: `Slot picker sent for ${params.planStage.display_name}`,
      details: {
        interviewerUserId: interviewerId,
        slotsOffered: options.length,
        stage: params.planStage.display_name,
      },
    });
  } else {
    logger.info("Plan slot picker skipped", {
      reason: result.reason,
      jobId: params.jobId,
      candidateId: params.candidateId,
    });
  }
}

/**
 * Brief 11 Phase C — central dispatch when a candidate enters a pipeline stage.
 * Fire-and-forget safe: errors are logged, never thrown to callers.
 */
export async function dispatchPlanStageOnCandidateMove(input: {
  jobId: string;
  organisationId: string;
  pipelineCandidateId: string;
  candidateId: string;
  pipelineStageId: string;
  initiatedBy?: string | null;
}): Promise<void> {
  if (!isPlanAutoExecuteEnabled()) return;

  const admin = createSupabaseAdmin();

  try {
    const ctx = await resolvePlanStageForPipelineStage(admin, input.jobId, input.pipelineStageId);
    if (!ctx) return;

    const { plan, planStage, pipelineStage } = ctx;

    await upsertStageTracking(admin, {
      planId: plan.id,
      planStageId: planStage.id,
      pipelineCandidateId: input.pipelineCandidateId,
      candidateId: input.candidateId,
      jobId: input.jobId,
    });

    await logPlanSystemEvent(admin, {
      planId: plan.id,
      candidateId: input.candidateId,
      eventType: "candidate_stage_moved",
      description: `Candidate moved to ${planStage.display_name}`,
      details: {
        planStageId: planStage.id,
        pipelineStageId: pipelineStage.id,
        stageType: planStage.stage_type,
      },
    });

    await sendPlanStageComms(admin, {
      planId: plan.id,
      candidateId: input.candidateId,
      jobId: input.jobId,
      organisationId: input.organisationId,
      planStage,
      pipelineStageName: pipelineStage.stage_name,
    });

    if (planStage.stage_type === "phone_screen") {
      try {
        const { triggerScreeningAfterFitScore } = await import("@/lib/screening/trigger");
        await triggerScreeningAfterFitScore(admin, {
          jobId: input.jobId,
          candidateId: input.candidateId,
          forcedMode: "whatsapp",
          triggeredBy: "auto",
        });
      } catch (err) {
        logger.warn("Plan auto-execute: screening dispatch failed", {
          error: err instanceof Error ? err.message : String(err),
          jobId: input.jobId,
          candidateId: input.candidateId,
        });
      }
    }

    await runInterviewSlotPicker(admin, {
      planId: plan.id,
      candidateId: input.candidateId,
      jobId: input.jobId,
      organisationId: input.organisationId,
      pipelineStageId: input.pipelineStageId,
      planStage,
      initiatedBy: input.initiatedBy,
    });

    if (planStage.stage_type === "assessment") {
      try {
        const { runPlanAssessmentAutoSend } = await import("@/lib/assessments/plan-auto-send");
        await runPlanAssessmentAutoSend(admin, {
          planId: plan.id,
          candidateId: input.candidateId,
          jobId: input.jobId,
          organisationId: input.organisationId,
          pipelineStageId: input.pipelineStageId,
          planStage,
          initiatedBy: input.initiatedBy,
        });
      } catch (err) {
        logger.warn("Plan auto-execute: assessment dispatch failed", {
          error: err instanceof Error ? err.message : String(err),
          jobId: input.jobId,
          candidateId: input.candidateId,
        });
      }
    }
  } catch (err) {
    logger.error("dispatchPlanStageOnCandidateMove failed", {
      error: err instanceof Error ? err.message : String(err),
      jobId: input.jobId,
      pipelineCandidateId: input.pipelineCandidateId,
    });
  }
}

export async function logPlanSlotBooked(input: {
  jobId: string;
  candidateId: string;
  scheduledAt: string;
  stageName?: string | null;
}): Promise<void> {
  if (!isPlanAutoExecuteEnabled()) return;

  const admin = createSupabaseAdmin();
  const { getRecruitmentPlanByJobId } = await import("./repository");
  const { plan } = await getRecruitmentPlanByJobId(admin, input.jobId);
  if (!plan) return;

  await logPlanSystemEvent(admin, {
    planId: plan.id,
    candidateId: input.candidateId,
    eventType: "slot_booked",
    description: `Interview confirmed for ${input.stageName ?? "interview"}`,
    details: {
      scheduledAt: input.scheduledAt,
      stage: input.stageName ?? null,
    },
  });
}

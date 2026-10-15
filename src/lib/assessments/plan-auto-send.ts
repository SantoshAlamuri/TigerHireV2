import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssessmentBuilderType, AssessmentShareChannel } from "@/lib/assessments/constants";
import { buildJobAssessmentsHref } from "@/lib/assessments/job-assessments-href";
import { isAssessmentStageReadyForAutoSend } from "@/lib/assessments/plan-assessment-ready";
import { logPlanSystemEvent } from "@/lib/recruitment-plan/plan-history-log";
import type { PlanStageRow } from "@/lib/recruitment-plan/types";
import { logger } from "@/lib/observability/logger";
import { createNotification } from "@/lib/services/notifications";
import {
  createAssessmentShareToken,
  sendAssessmentShareMessages,
} from "@/lib/services/assessment-share";

const ASSESSMENT_INSERT_FIELDS =
  "id, application_id, stage_id, organisation_id, type, title, status, share_token, reviewer_id";

function resolveAssessmentType(planStage: PlanStageRow): AssessmentBuilderType {
  return planStage.format === "async" ? "take_home" : "written";
}

function resolveDeadlineIso(planStage: PlanStageRow): string {
  const now = Date.now();
  if (planStage.duration_minutes && planStage.duration_minutes > 0) {
    return new Date(now + planStage.duration_minutes * 60 * 1000).toISOString();
  }
  if (planStage.target_dwell_days > 0) {
    return new Date(now + planStage.target_dwell_days * 24 * 60 * 60 * 1000).toISOString();
  }
  return new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
}

function buildInstructions(
  planStage: PlanStageRow,
  jobTitle: string,
  rubricName?: string | null,
): string {
  const step = planStage.display_name?.trim() || "Assessment";
  const rubricLine = rubricName
    ? `<p>Submissions are reviewed using the <strong>${rubricName}</strong> scorecard.</p>`
    : "";
  return `<p>Please complete <strong>${step}</strong> for <strong>${jobTitle}</strong>.</p>${rubricLine}<p>Use the secure link we sent to submit your work before the deadline.</p>`;
}

/**
 * When a candidate enters a pre-configured assessment plan stage, create a pending assessment
 * and share it (email / WhatsApp). Skips if contact is missing or a pending assessment exists.
 */
export async function runPlanAssessmentAutoSend(
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
  if (!isAssessmentStageReadyForAutoSend(params.planStage)) return;

  const { data: app } = await admin
    .from("applications")
    .select("id")
    .eq("job_id", params.jobId)
    .eq("candidate_id", params.candidateId)
    .maybeSingle();
  if (!app?.id) {
    logger.info("Plan assessment auto-send skipped: no application", {
      jobId: params.jobId,
      candidateId: params.candidateId,
    });
    return;
  }

  const { data: existing } = await admin
    .from("assessments")
    .select("id, status")
    .eq("application_id", app.id)
    .eq("stage_id", params.pipelineStageId)
    .in("status", ["pending", "submitted"])
    .maybeSingle();
  if (existing?.id) {
    logger.info("Plan assessment auto-send skipped: assessment already exists", {
      assessmentId: existing.id,
      status: existing.status,
    });
    return;
  }

  const { data: cand } = await admin
    .from("candidates")
    .select("name, full_name, email, phone")
    .eq("id", params.candidateId)
    .maybeSingle();
  const email = (cand?.email as string | null)?.trim() || null;
  const phone = (cand?.phone as string | null)?.trim() || null;
  if (!email && !phone) {
    logger.warn("Plan assessment auto-send skipped: no candidate email or phone", {
      candidateId: params.candidateId,
      planStageId: params.planStage.id,
    });
    return;
  }

  const { data: jobRow } = await admin
    .from("jobs")
    .select("title")
    .eq("id", params.jobId)
    .maybeSingle();
  const jobTitle = (jobRow?.title as string | null)?.trim() || "the role";

  let rubricName: string | null = null;
  if (params.planStage.scorecard_template_id) {
    const { data: rubric } = await admin
      .from("feedback_form_templates")
      .select("name")
      .eq("id", params.planStage.scorecard_template_id)
      .maybeSingle();
    rubricName = (rubric?.name as string | null)?.trim() || null;
  }

  const shareToken = createAssessmentShareToken();
  const deadlineAt = resolveDeadlineIso(params.planStage);
  const title = params.planStage.display_name?.trim() || "Assessment";
  const instructions = buildInstructions(params.planStage, jobTitle, rubricName);

  const { data: assessment, error } = await admin
    .from("assessments")
    .insert({
      application_id: app.id,
      stage_id: params.pipelineStageId,
      organisation_id: params.organisationId,
      type: resolveAssessmentType(params.planStage),
      title,
      instructions,
      deadline_at: deadlineAt,
      reviewer_id: params.planStage.primary_interviewer_id,
      pass_threshold_pct: 60,
      auto_advance: true,
      created_by: params.initiatedBy ?? null,
      status: "pending",
      share_token: shareToken,
    })
    .select(ASSESSMENT_INSERT_FIELDS)
    .single();

  if (error || !assessment) {
    logger.warn("Plan assessment auto-send: insert failed", {
      error: error?.message,
      jobId: params.jobId,
      candidateId: params.candidateId,
    });
    return;
  }

  const channels: AssessmentShareChannel[] = [];
  if (email) channels.push("email");
  if (phone) channels.push("whatsapp");

  const person = (cand?.full_name ?? cand?.name ?? "there").split(" ")[0] ?? "there";
  const delivery = await sendAssessmentShareMessages({
    channels,
    recipientName: person,
    recipientEmail: email,
    recipientPhone: phone,
    assessmentTitle: title,
    deadlineAt,
    shareToken,
  });

  if (assessment.reviewer_id) {
    await createNotification({
      userId: assessment.reviewer_id as string,
      type: "approval_needed",
      title: "Assessment assigned for review",
      body: `${title} was auto-assigned from the hiring plan.`,
      link: buildJobAssessmentsHref(params.jobId, {
        applicationId: app.id,
        stageId: params.pipelineStageId,
      }),
      metadata: { assessmentId: assessment.id, jobId: params.jobId },
    });
  }

  await logPlanSystemEvent(admin, {
    planId: params.planId,
    candidateId: params.candidateId,
    eventType: "assessment_sent",
    description: `Assessment "${title}" sent for ${params.planStage.display_name}`,
    details: {
      assessmentId: assessment.id,
      applicationId: app.id,
      stageId: params.pipelineStageId,
      channels,
      emailSent: delivery.emailSent,
      whatsappSent: delivery.whatsappSent,
    },
  });
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotification } from "@/lib/services/notifications";
import { logger } from "@/lib/observability/logger";
import {
  formatJdReconcileNotificationBody,
  type JdReconcileScoreDiff,
} from "./jd-reconcile-score-diff";
import { getRecruitmentPlanByJobId } from "@/lib/recruitment-plan/repository";
import { logPlanSystemEvent } from "@/lib/recruitment-plan/plan-history-log";

/**
 * Notify job stakeholders when JD Base reconciliation re-scores candidates.
 */
export async function notifyJdReconcileComplete(
  admin: SupabaseClient,
  params: {
    jobId: string;
    scoredCount: number;
    failedCount: number;
    approvedByUserId: string;
    verdictChanges?: JdReconcileScoreDiff[];
  },
): Promise<void> {
  if (params.scoredCount <= 0) return;

  const { data: job } = await admin
    .from("jobs")
    .select("title, hiring_manager_id, created_by")
    .eq("id", params.jobId)
    .maybeSingle();

  if (!job) return;

  const title = (job.title as string | null) ?? "Role";
  const verdictChanges = params.verdictChanges ?? [];
  const body = formatJdReconcileNotificationBody({
    jobTitle: title,
    scoredCount: params.scoredCount,
    failedCount: params.failedCount,
    verdictChanges,
  });

  const recipients = new Set<string>();
  if (job.hiring_manager_id) recipients.add(job.hiring_manager_id as string);
  if (job.created_by) recipients.add(job.created_by as string);
  recipients.add(params.approvedByUserId);

  for (const userId of recipients) {
    const ok = await createNotification({
      userId,
      type: "general",
      title: `Scores updated — ${title}`,
      body,
      link: `/recruit/jobs/${params.jobId}`,
    });
    if (!ok) {
      logger.warn("notifyJdReconcileComplete: notification failed", {
        userId,
        jobId: params.jobId,
      });
    }
  }
}

export async function logJdRescorePlanHistory(
  admin: SupabaseClient,
  params: {
    jobId: string;
    scoredCount: number;
    verdictChanges: JdReconcileScoreDiff[];
  },
): Promise<void> {
  if (params.scoredCount <= 0) return;

  const { plan } = await getRecruitmentPlanByJobId(admin, params.jobId);
  if (!plan) return;

  const changed = params.verdictChanges.length;
  await logPlanSystemEvent(admin, {
    planId: plan.id,
    eventType: "rescore_completed",
    description: `${params.scoredCount} candidates re-scored, ${changed} verdict change${changed === 1 ? "" : "s"}`,
    details: {
      total: params.scoredCount,
      changed,
      diffs: params.verdictChanges,
    },
  });
}

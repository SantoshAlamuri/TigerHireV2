/**
 * Async job queue. Uses Inngest when INNGEST_EVENT_KEY is set (production);
 * otherwise no-op so dev and tests don't require Inngest.
 */

import { logger } from "@/lib/observability/logger";

export type JobName =
  | "agency-candidate-reprocess"
  | "cv-parse-retry"
  | "fit-score-batch"
  | "fit-score-single"
  | "pipeline-reminder"
  | "webhook-process"
  | "whatsapp-inbound"
  | "job-distribute"
  | "job-remove-from-boards"
  | "resume-parse"
  | "offer-bgv-trigger"
  | "headcount-plan-sync"
  | "referral-campaign-send"
  | "referral-campaign-scheduled-launch"
  | "referral-campaign-attribute"
  | "referral-campaign-status-attribute"
  | "screening-inactivity"
  | "prescreen-lifecycle"
  | "requisition-generate-jd"
  | "jd-base-approval-reconcile";

export type JobPayload = Record<string, unknown>;

/** Event name for Inngest (must match function trigger). */
const JOB_TO_EVENT: Partial<Record<JobName, string>> = {
  "agency-candidate-reprocess": "agency/candidate-reprocess",
  "cv-parse-retry": "cv-parse/retry",
  "fit-score-batch": "fit-score/batch",
  "fit-score-single": "fit-score/single",
  "pipeline-reminder": "pipeline/reminder",
  "webhook-process": "webhook/process",
  "whatsapp-inbound": "whatsapp/inbound",
  "job-distribute": "job/distribute",
  "job-remove-from-boards": "job/remove-from-boards",
  "resume-parse": "resume/parse",
  "offer-bgv-trigger": "offer/bgv-trigger",
  "headcount-plan-sync": "headcount-plan-sync/run",
  "referral-campaign-send": "referral-campaign/send",
  "referral-campaign-scheduled-launch": "referral-campaign/scheduled-launch",
  "referral-campaign-attribute": "referral-campaign/attribute",
  "referral-campaign-status-attribute": "referral-campaign/status-attribute",
  "screening-inactivity": "screening/inactivity",
  "prescreen-lifecycle": "prescreen/lifecycle",
  "requisition-generate-jd": "requisition/generate-jd",
  "jd-base-approval-reconcile": "jd-base/approval-reconcile",
};

/**
 * Enqueue a job. Sends to Inngest when INNGEST_EVENT_KEY is set; otherwise no-op.
 * Jobs survive cold starts and restarts when Inngest is configured.
 */
export async function enqueue(
  name: JobName,
  payload: JobPayload,
  options?: { id?: string },
): Promise<{ id?: string }> {
  const eventName = JOB_TO_EVENT[name];
  if (!eventName) {
    logger.warn("Queue job has no mapped event; skipping enqueue", { name });
    return {};
  }

  const key = process.env.INNGEST_EVENT_KEY;
  if (!key) {
    logger.info("Queue enqueue skipped because INNGEST_EVENT_KEY is not configured", {
      name,
      eventName,
    });
    return {};
  }

  try {
    const { inngest } = await import("@/inngest/client");
    const result = await inngest.send({
      name: eventName,
      data: payload,
      ...(options?.id ? { id: options.id } : {}),
    });
    const id = Array.isArray(result?.ids) ? result.ids[0] : undefined;
    return { id };
  } catch (error) {
    logger.error("Queue enqueue failed", {
      name,
      eventName,
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

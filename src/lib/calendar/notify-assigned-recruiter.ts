import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotification } from "@/lib/services/notifications";
import { logger } from "@/lib/observability/logger";

export type SchedulingRecruiterNotifyKind =
  | "slots_published"
  | "self_schedule_link"
  | "candidate_booked"
  | "invite_delivery_failed";

export async function resolveAssignedRecruiterId(
  admin: SupabaseClient,
  jobId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("jobs")
    .select("assigned_recruiter_id, created_by")
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    logger.warn("resolveAssignedRecruiterId failed", { jobId, error: error.message });
    return null;
  }
  return (
    (data?.assigned_recruiter_id as string | null) ?? (data?.created_by as string | null) ?? null
  );
}

/**
 * In-app notification to the job's assigned recruiter (fallback: job creator).
 * Skips when recruiter is the actor or no recruiter is assigned.
 */
export async function notifyAssignedRecruiterForJob(
  admin: SupabaseClient,
  params: {
    jobId: string;
    title: string;
    body: string;
    link: string;
    kind: SchedulingRecruiterNotifyKind;
    metadata?: Record<string, string>;
    actorUserId?: string | null;
  },
): Promise<void> {
  const recruiterId = await resolveAssignedRecruiterId(admin, params.jobId);
  if (!recruiterId) return;
  if (params.actorUserId && params.actorUserId === recruiterId) return;

  await createNotification({
    userId: recruiterId,
    type: "application_update",
    title: params.title,
    body: params.body,
    link: params.link,
    metadata: {
      source: `scheduling_${params.kind}`,
      jobId: params.jobId,
      ...params.metadata,
    },
  });
}

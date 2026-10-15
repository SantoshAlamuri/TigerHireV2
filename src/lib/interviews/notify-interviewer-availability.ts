import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/services/notifications";
import { sendEmail } from "@/lib/services/resend";
import { logger } from "@/lib/observability/logger";
import { env } from "@/lib/config/env";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function availabilityPageUrl(): string {
  return `${env.baseUrl}/company/my-availability`;
}

/**
 * One-time nudge per (job, interviewer). At most one nudge per interviewer per UTC day across all jobs.
 */
export async function notifyInterviewerToDeclareAvailability(params: {
  jobId: string;
  jobTitle: string;
  interviewerUserId: string;
}): Promise<void> {
  const admin = createSupabaseAdmin();
  const { jobId, jobTitle, interviewerUserId } = params;

  const { data: existing } = await admin
    .from("interviewer_availability_nudges")
    .select("id")
    .eq("job_id", jobId)
    .eq("user_id", interviewerUserId)
    .maybeSingle();

  if (existing?.id) return;

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  const { count: todayCount } = await admin
    .from("interviewer_availability_nudges")
    .select("id", { count: "exact", head: true })
    .eq("user_id", interviewerUserId)
    .gte("sent_at", dayStart.toISOString());

  if ((todayCount ?? 0) >= 1) {
    logger.info("Skipping availability nudge: daily cap reached", {
      interviewerUserId,
      jobId,
    });
    return;
  }

  const link = availabilityPageUrl();
  const title = `Declare availability for ${jobTitle}`;
  const body = `You're an interviewer on ${jobTitle}. Add your availability so recruiters can schedule efficiently.`;

  await createNotification({
    userId: interviewerUserId,
    type: "general",
    title,
    body,
    link,
    metadata: { job_id: jobId, kind: "interviewer_availability_nudge" },
  });

  const { data: profile } = await admin
    .from("profiles")
    .select("email, full_name")
    .eq("id", interviewerUserId)
    .maybeSingle();

  const email = (profile?.email as string | null)?.trim();
  if (email) {
    try {
      await sendEmail({
        to: email,
        subject: title,
        html: `<p>Hi ${(profile?.full_name as string | null)?.trim() || "there"},</p>
<p>${body}</p>
<p><a href="${link}">Declare your availability</a></p>`,
      });
    } catch (e) {
      logger.warn("Availability nudge email failed", {
        error: String(e),
        interviewerUserId,
        jobId,
      });
    }
  }

  const { error: insertErr } = await admin.from("interviewer_availability_nudges").insert({
    job_id: jobId,
    user_id: interviewerUserId,
  });

  if (insertErr) {
    logger.warn("interviewer_availability_nudges insert failed", {
      error: String(insertErr),
      jobId,
      interviewerUserId,
    });
  }
}

export async function notifyNewJobInterviewers(params: {
  jobId: string;
  jobTitle: string;
  previousInterviewerIds: Set<string>;
  nextInterviewerIds: Set<string>;
}): Promise<void> {
  const added = [...params.nextInterviewerIds].filter(
    (id) => !params.previousInterviewerIds.has(id),
  );
  for (const userId of added) {
    await notifyInterviewerToDeclareAvailability({
      jobId: params.jobId,
      jobTitle: params.jobTitle,
      interviewerUserId: userId,
    });
  }
}

/** @internal test helper */
export function isWithinDailyCap(lastSentAt: string | null, now = Date.now()): boolean {
  if (!lastSentAt) return false;
  return now - new Date(lastSentAt).getTime() < ONE_DAY_MS;
}

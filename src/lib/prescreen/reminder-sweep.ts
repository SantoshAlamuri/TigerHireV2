import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import { prescreenReminderHours } from "@/lib/prescreen/config";
import { processPrescreenReminder } from "@/lib/prescreen/lifecycle";
import { getApprovedJdBase } from "@/lib/prescreen/repository";
import type { PrescreenChannel } from "@/lib/prescreen/types";

const MAX_REMINDER_SWEEP_PER_RUN = 200;

/**
 * Cron safety net: send due prescreen reminders when Inngest lifecycle was never
 * scheduled (e.g. post-shortlist before lifecycle wiring) or an event was dropped.
 */
export async function sweepDuePrescreenReminders(
  admin: SupabaseClient,
): Promise<{ scanned: number; sent: number }> {
  const cutoffIso = new Date(Date.now() - prescreenReminderHours() * 3_600_000).toISOString();

  const { data, error } = await admin
    .from("prescreen_sessions")
    .select("id, job_id, candidate_id, channel, questions_sent_at")
    .neq("state", "complete")
    .is("reminder_sent_at", null)
    .not("questions_sent_at", "is", null)
    .lt("questions_sent_at", cutoffIso)
    .limit(MAX_REMINDER_SWEEP_PER_RUN);

  if (error) throw error;
  const sessions = data ?? [];
  if (sessions.length === 0) return { scanned: 0, sent: 0 };

  let sent = 0;
  for (const session of sessions) {
    const jobId = session.job_id as string;
    const candidateId = session.candidate_id as string;
    const jdBase = await getApprovedJdBase(admin, jobId);
    if (!jdBase) continue;

    const { data: candidate } = await admin
      .from("candidates")
      .select("phone")
      .eq("id", candidateId)
      .maybeSingle();
    const phone = (candidate?.phone as string | null)?.trim() ?? null;
    if (!phone) continue;

    // The template fallback names the company; a null org id degrades the copy
    // to "at the hiring team", so resolve it from the job.
    const { data: jobRow } = await admin
      .from("jobs")
      .select("organisation_id")
      .eq("id", jobId)
      .maybeSingle();
    const organisationId =
      ((jobRow as { organisation_id?: string | null } | null)?.organisation_id as string | null) ??
      null;

    try {
      const result = await processPrescreenReminder({
        sessionId: session.id as string,
        jobId,
        candidateId,
        organisationId,
        jdBaseDocumentId: jdBase.id,
        channel: session.channel as PrescreenChannel,
        phone,
        questionsSentAtIso: session.questions_sent_at as string,
      });
      if (result.sent) sent += 1;
    } catch (err) {
      logger.error("[prescreen-reminder-sweep] send failed", {
        sessionId: session.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info("[prescreen-reminder-sweep] complete", { scanned: sessions.length, sent });
  return { scanned: sessions.length, sent };
}

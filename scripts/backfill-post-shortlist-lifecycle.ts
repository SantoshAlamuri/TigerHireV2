/**
 * Backfill Inngest prescreen-lifecycle for open post-shortlist sessions that were
 * created before lifecycle scheduling was enabled for that stage.
 *
 *   NODE_OPTIONS='--conditions=react-server' npx tsx --env-file=.env.local scripts/backfill-post-shortlist-lifecycle.ts --dry-run
 *   NODE_OPTIONS='--conditions=react-server' npx tsx --env-file=.env.local scripts/backfill-post-shortlist-lifecycle.ts --send
 *
 * Optional: --job-id=<uuid> (default: Masai Lead BA)
 */
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getApprovedJdBase } from "@/lib/prescreen/repository";
import { schedulePrescreenLifecycle } from "@/lib/prescreen/schedule-lifecycle";

const DEFAULT_JOB_ID = "b863d72c-fc73-4842-8a9d-d5d84eff63e3";
const dryRun = !process.argv.includes("--send");
const jobArg = process.argv.find((a) => a.startsWith("--job-id="));
const jobId = jobArg?.split("=")[1] ?? DEFAULT_JOB_ID;

async function main() {
  const admin = createSupabaseAdmin();
  const jdBase = await getApprovedJdBase(admin, jobId);
  if (!jdBase) throw new Error(`No approved JD base for job ${jobId}`);

  const { data: sessions, error } = await admin
    .from("prescreen_sessions")
    .select("id, job_id, candidate_id, channel, questions_sent_at, state, reminder_sent_at")
    .eq("job_id", jobId)
    .eq("stage", "post_shortlist")
    .neq("state", "complete")
    .not("questions_sent_at", "is", null);

  if (error) throw error;

  const rows = sessions ?? [];
  let scheduled = 0;
  let skipped = 0;

  console.log(JSON.stringify({ dryRun, jobId, openSessions: rows.length }, null, 2));

  for (const session of rows) {
    const questionsSentAtIso = session.questions_sent_at as string;
    const { data: candidate } = await admin
      .from("candidates")
      .select("phone")
      .eq("id", session.candidate_id as string)
      .maybeSingle();
    const phone = (candidate?.phone as string | null)?.trim() ?? null;
    if (!phone) {
      skipped += 1;
      console.warn("[skip] no phone", session.candidate_id);
      continue;
    }

    const payload = {
      sessionId: session.id as string,
      jobId,
      candidateId: session.candidate_id as string,
      organisationId: null,
      jdBaseDocumentId: jdBase.id,
      channel: session.channel as "whatsapp",
      phone,
      questionsSentAtIso,
    };

    if (dryRun) {
      console.log("[dry-run]", payload.sessionId, payload.candidateId, questionsSentAtIso);
      scheduled += 1;
      continue;
    }

    await schedulePrescreenLifecycle(payload);
    scheduled += 1;
    if (scheduled % 25 === 0) {
      console.log(`[progress] scheduled ${scheduled}/${rows.length}`);
    }
  }

  console.log(JSON.stringify({ dryRun, scheduled, skipped }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

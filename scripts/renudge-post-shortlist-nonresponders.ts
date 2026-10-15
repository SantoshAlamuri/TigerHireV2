/**
 * Re-invite shortlisted candidates whose post-shortlist WhatsApp round timed
 * out before they answered all questions. Sends the approved th_shortlisted
 * template, reopens the session as awaiting_consent WITHOUT deleting any
 * recorded answers, and reschedules the reminder/timeout lifecycle.
 *
 *   NODE_OPTIONS='--conditions=react-server' npx tsx --env-file=.env.local scripts/renudge-post-shortlist-nonresponders.ts --dry-run
 *   NODE_OPTIONS='--conditions=react-server' npx tsx --env-file=.env.local scripts/renudge-post-shortlist-nonresponders.ts --send
 *
 * Optional: --job-id=<uuid> (default: Masai Lead BA), --org-id=<uuid>
 */
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { renudgePostShortlistNonResponders } from "@/lib/prescreen/renudge-post-shortlist";

const DEFAULT_JOB_ID = "b863d72c-fc73-4842-8a9d-d5d84eff63e3";
const dryRun = !process.argv.includes("--send");
const jobArg = process.argv.find((a) => a.startsWith("--job-id="));
const orgArg = process.argv.find((a) => a.startsWith("--org-id="));
const jobId = jobArg?.split("=")[1] ?? DEFAULT_JOB_ID;

async function main() {
  const admin = createSupabaseAdmin();

  let organisationId = orgArg?.split("=")[1] ?? null;
  if (!organisationId) {
    const { data: job } = await admin
      .from("jobs")
      .select("organisation_id")
      .eq("id", jobId)
      .maybeSingle();
    organisationId = (job?.organisation_id as string | null) ?? null;
  }

  const result = await renudgePostShortlistNonResponders(admin, {
    jobId,
    organisationId,
    dryRun,
  });

  console.log(
    JSON.stringify(
      {
        dryRun: result.dryRun,
        totalQuestions: result.totalQuestions,
        eligible: result.eligible,
        sent: result.sent,
        failed: result.failed,
        targets: result.targets,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

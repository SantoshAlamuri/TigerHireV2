/**
 * Resend post-shortlist consent invite (th_shortlist_screening) to candidates who
 * never replied to the original th_shortlisted invite.
 *
 *   npx tsx --env-file=.env.local scripts/resend-masai-non-responders.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/resend-masai-non-responders.ts --send
 */
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendPostShortlistToShortlisted } from "@/lib/prescreen/bulk-post-shortlist";

const MASAI_ORG_ID = "8709084a-ed5c-4009-8f83-b724d56254e5";
const LEAD_BA_JOB_ID = "b863d72c-fc73-4842-8a9d-d5d84eff63e3";

const dryRun = !process.argv.includes("--send");

async function main() {
  const admin = createSupabaseAdmin();

  const preview = await sendPostShortlistToShortlisted({
    admin,
    jobId: LEAD_BA_JOB_ID,
    organisationId: MASAI_ORG_ID,
    dryRun: true,
    forceResend: true,
    resendSessionStates: ["awaiting_consent"],
  });

  console.log("Non-responders (awaiting_consent only):");
  console.log(JSON.stringify(preview, null, 2));

  if (dryRun) {
    console.log("\nDry run — pass --send to dispatch th_shortlist_screening.");
    return;
  }

  if (preview.eligibleToSend === 0) {
    console.log("Nothing to send.");
    return;
  }

  const result = await sendPostShortlistToShortlisted({
    admin,
    jobId: LEAD_BA_JOB_ID,
    organisationId: MASAI_ORG_ID,
    dryRun: false,
    forceResend: true,
    resendSessionStates: ["awaiting_consent"],
  });

  console.log("\nSend result:");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

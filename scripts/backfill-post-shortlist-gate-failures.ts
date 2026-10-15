/**
 * Backfill gate_status + Gated Out FitScore for shortlisted candidates who answered
 * NO on a post-shortlist screening question (e.g. office location).
 *
 *   NODE_OPTIONS='--conditions=react-server' npx tsx --env-file=.env.local scripts/backfill-post-shortlist-gate-failures.ts
 *   NODE_OPTIONS='--conditions=react-server' npx tsx --env-file=.env.local scripts/backfill-post-shortlist-gate-failures.ts --job-id=<uuid>
 */
import {
  getApprovedJdBase,
  getGatingQuestions,
  setApplicationGate,
} from "@/lib/prescreen/repository";
import { saveGatedFitScore } from "@/lib/prescreen/save-gated";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const DEFAULT_JOB_ID = "b863d72c-fc73-4842-8a9d-d5d84eff63e3";
const dryRun = !process.argv.includes("--apply");

function jobIdFromArgs(): string {
  const arg = process.argv.find((a) => a.startsWith("--job-id="));
  return arg?.slice("--job-id=".length) ?? DEFAULT_JOB_ID;
}

async function main() {
  const jobId = jobIdFromArgs();
  const admin = createSupabaseAdmin();
  const jdBase = await getApprovedJdBase(admin, jobId);
  if (!jdBase) throw new Error(`No approved JD base for job ${jobId}`);

  const postQuestions = await getGatingQuestions(admin, jdBase.id, "post_shortlist");
  const postQuestionIds = postQuestions.map((q) => q.id);
  if (postQuestionIds.length === 0) {
    console.log("No post-shortlist questions; nothing to do.");
    return;
  }

  const { data: failedResponses, error: respErr } = await admin
    .from("prescreen_responses")
    .select("candidate_id, question_id, passed")
    .eq("job_id", jobId)
    .in("question_id", postQuestionIds)
    .eq("passed", false);
  if (respErr) throw respErr;

  const candidateIds = [...new Set((failedResponses ?? []).map((r) => r.candidate_id as string))];
  if (candidateIds.length === 0) {
    console.log("No post-shortlist NO answers found.");
    return;
  }

  const { data: apps, error: appErr } = await admin
    .from("applications")
    .select("id, candidate_id, gate_status, candidates(name)")
    .eq("job_id", jobId)
    .in("candidate_id", candidateIds);
  if (appErr) throw appErr;

  const toFix = (apps ?? []).filter((a) => a.gate_status !== "failed");
  console.log(
    `[${dryRun ? "dry-run" : "apply"}] job=${jobId} candidates with post-shortlist NO: ${candidateIds.length}, need gate fix: ${toFix.length}`,
  );

  for (const app of toFix) {
    const name = (app.candidates as { name?: string } | null)?.name?.trim() ?? app.candidate_id;
    console.log(`  - ${name} (${app.candidate_id})`);
    if (dryRun) continue;

    await setApplicationGate(admin, {
      jobId,
      candidateId: app.candidate_id as string,
      gateStatus: "failed",
    });
    await saveGatedFitScore(admin, {
      job_id: jobId,
      candidate_id: app.candidate_id as string,
      reason: "prescreen_answer_failed",
    });
  }

  if (dryRun) {
    console.log("Re-run with --apply to persist.");
  } else {
    console.log("Done.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

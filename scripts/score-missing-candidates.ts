/**
 * Score ONLY candidates on a job that have no current fit_scores row
 * (never supersedes existing scores). Use after uploads arrive while a JD
 * was unapproved, or when a batch partially failed.
 *
 *   NODE_OPTIONS='--conditions=react-server' npx tsx --env-file=.env.local scripts/score-missing-candidates.ts --job <uuid> --dry-run
 *   NODE_OPTIONS='--conditions=react-server' npx tsx --env-file=.env.local scripts/score-missing-candidates.ts --job <uuid>
 */

function parseArgs(argv: string[]): { jobId: string; dryRun: boolean } {
  const jobIdx = argv.indexOf("--job");
  const jobId = jobIdx >= 0 ? argv[jobIdx + 1] : "";
  if (!jobId) {
    console.error("Usage: score-missing-candidates.ts --job <uuid> [--dry-run]");
    process.exit(1);
  }
  return { jobId, dryRun: argv.includes("--dry-run") };
}

async function main() {
  const [{ createSupabaseAdmin }, { FitScoreService }, { getJdBaseByJobId }] = await Promise.all([
    import("@/lib/supabase/admin"),
    import("@/lib/services/FitScoreService"),
    import("@/lib/fitscore/hybrid/jd-base"),
  ]);

  const { jobId, dryRun } = parseArgs(process.argv.slice(2));
  const admin = createSupabaseAdmin();

  const jdBase = await getJdBaseByJobId(admin, jobId);
  if (!jdBase?.approvedBy) {
    console.error("JD Base must exist and be HM-approved for hybrid scoring on this job.");
    process.exit(1);
  }

  const [{ data: apps, error: appErr }, { data: scores, error: scoreErr }] = await Promise.all([
    admin.from("applications").select("candidate_id").eq("job_id", jobId),
    admin.from("fit_scores").select("candidate_id").eq("job_id", jobId).is("superseded_at", null),
  ]);
  if (appErr) throw appErr;
  if (scoreErr) throw scoreErr;

  const scored = new Set((scores ?? []).map((r) => r.candidate_id as string));
  const missing = [
    ...new Set(
      (apps ?? [])
        .map((r) => r.candidate_id as string | null)
        .filter((id): id is string => Boolean(id) && !scored.has(id as string)),
    ),
  ].sort();

  console.log(
    JSON.stringify({
      jobId,
      applications: apps?.length ?? 0,
      alreadyScored: scored.size,
      missing: missing.length,
      dryRun,
    }),
  );
  if (missing.length === 0 || dryRun) {
    for (const id of missing) console.log(`  ${id}`);
    return;
  }

  const batchResult = await FitScoreService.computeBatch(admin, jobId, missing, {
    onUnapprovedJdBase: "throw",
    source: "script",
  });
  console.log(`Scored: ${batchResult.scored}  Failed: ${batchResult.failed}`);
  for (const f of batchResult.failedCandidateIds) {
    console.log(`  FAILED ${f.candidateId}: ${f.error}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

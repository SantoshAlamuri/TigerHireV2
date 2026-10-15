/**
 * Score N candidates (force) and print calls_per_score from platform_cost_events.
 *
 * Usage:
 *   npx tsx scripts/validate-fitscore-cost-run.ts --job <uuid> --limit 20
 */
import dotenv from "dotenv";
import path from "path";
import { spawnSync } from "node:child_process";

function ensureReactServerCondition(): void {
  const has =
    process.execArgv.includes("--conditions=react-server") ||
    (process.env.NODE_OPTIONS ?? "").includes("--conditions=react-server");
  if (has || process.env.TIGERHIRE_SCORE_CLI_RELAUNCHED === "1") return;
  const nodeOptions = `${process.env.NODE_OPTIONS ?? ""} --conditions=react-server`.trim();
  const result = spawnSync("npx", ["tsx", ...process.argv.slice(1)], {
    stdio: "inherit",
    env: { ...process.env, NODE_OPTIONS: nodeOptions, TIGERHIRE_SCORE_CLI_RELAUNCHED: "1" },
  });
  process.exit(result.status ?? 1);
}

function parseArgs(argv: string[]) {
  const jobIdx = argv.indexOf("--job");
  const limitIdx = argv.indexOf("--limit");
  const candidatesIdx = argv.indexOf("--candidates");
  const jobId = jobIdx >= 0 ? argv[jobIdx + 1] : "";
  const limit = limitIdx >= 0 ? Number(argv[limitIdx + 1]) : 20;
  const candidateIds =
    candidatesIdx >= 0
      ? (argv[candidatesIdx + 1] ?? "")
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
      : [];
  if (!jobId) {
    console.error(
      "Usage: npx tsx scripts/validate-fitscore-cost-run.ts --job <uuid> [--limit 20] [--candidates id1,id2]",
    );
    process.exit(1);
  }
  return { jobId, limit, candidateIds };
}

async function main() {
  ensureReactServerCondition();
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

  const { jobId, limit, candidateIds: explicitCandidateIds } = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();

  const [{ createSupabaseAdmin }, { FitScoreService }, { getJdBaseByJobId }] = await Promise.all([
    import("@/lib/supabase/admin"),
    import("@/lib/services/FitScoreService"),
    import("@/lib/fitscore/hybrid/jd-base"),
  ]);

  const admin = createSupabaseAdmin();
  const jdBase = await getJdBaseByJobId(admin, jobId);
  if (!jdBase?.approvedBy) {
    console.error("JD Base must be HM-approved for this job.");
    process.exit(1);
  }

  const { data: pipelineRows } = await admin
    .from("pipeline_candidates")
    .select("candidate_id")
    .eq("job_id", jobId);
  const { data: appRows } = await admin
    .from("applications")
    .select("candidate_id")
    .eq("job_id", jobId);

  const ids = new Set<string>();
  for (const r of pipelineRows ?? []) {
    const id = (r as { candidate_id: string }).candidate_id;
    if (id) ids.add(id);
  }
  for (const r of appRows ?? []) {
    const id = (r as { candidate_id: string | null }).candidate_id;
    if (id) ids.add(id);
  }

  const candidateIds =
    explicitCandidateIds.length > 0 ? explicitCandidateIds : [...ids].sort().slice(0, limit);
  if (candidateIds.length === 0) {
    console.error("No candidates on job.");
    process.exit(1);
  }

  console.log(`\n=== FitScore cost validation run ===`);
  console.log(`Job: ${jobId}`);
  console.log(`Candidates: ${candidateIds.length}`);
  console.log(`Started: ${startedAt}\n`);

  const batch = await FitScoreService.computeBatch(admin, jobId, candidateIds, {
    force: true,
    source: "script",
    onUnapprovedJdBase: "throw",
  });

  const endedAt = new Date().toISOString();
  console.log(`Scored: ${batch.scored}  Failed: ${batch.failed}`);
  console.log(`Ended: ${endedAt}\n`);

  const { data: events } = await admin
    .from("platform_cost_events")
    .select("id, candidate_id, metadata, occurred_at, provider, service")
    .gte("occurred_at", startedAt)
    .lte("occurred_at", endedAt)
    .eq("provider", "anthropic");

  const anthropicCalls = (events ?? []).filter(
    (e) => (e.metadata as { status?: string })?.status !== "error",
  );
  const verdictCalls = anthropicCalls.filter(
    (e) => (e.metadata as { label?: string })?.label === "fitscore-hybrid-extraction-verdict",
  );

  const { data: obsEvents } = await admin
    .from("platform_cost_events")
    .select("metadata")
    .gte("occurred_at", startedAt)
    .lte("occurred_at", endedAt)
    .eq("provider", "tigerhire")
    .eq("service", "fitscore_scoring");

  let dedupeSkips = 0;
  let concurrentSkips = 0;
  for (const row of obsEvents ?? []) {
    const t = (row.metadata as { type?: string })?.type;
    if (t === "fitscore_dedupe_skip") dedupeSkips += 1;
    if (t === "fitscore_concurrent_skip") concurrentSkips += 1;
  }

  const candidatesScored = batch.scored;
  const verdictCallCount = verdictCalls.length;
  const callsPerScore =
    candidatesScored > 0 ? Number((verdictCallCount / candidatesScored).toFixed(2)) : 0;

  const summary = {
    type: "fitscore_validation_run",
    job_id: jobId,
    started_at: startedAt,
    ended_at: endedAt,
    candidates_attempted: candidateIds.length,
    candidates_scored: candidatesScored,
    total_anthropic_calls: anthropicCalls.length,
    extraction_verdict_calls: verdictCallCount,
    calls_per_score: callsPerScore,
    dedupe_skips: dedupeSkips,
    concurrent_skips: concurrentSkips,
    failed: batch.failed,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

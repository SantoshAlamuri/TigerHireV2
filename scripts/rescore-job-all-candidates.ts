/**
 * Re-run FitScore (hybrid when JD Base is HM-approved) for every candidate on one job.
 *
 * Candidate IDs are the union of:
 * - pipeline_candidates for this job_id
 * - applications for this job_id
 *
 * Usage:
 *   npx tsx scripts/rescore-job-all-candidates.ts --job <job-uuid>
 *   npx tsx scripts/rescore-job-all-candidates.ts --title "QA Engineer"
 *   npx tsx scripts/rescore-job-all-candidates.ts --title "QA Engineer" --organisation-id <org-uuid>
 *   npx tsx scripts/rescore-job-all-candidates.ts --job <uuid> --dry-run
 *
 * Requires .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 */

import dotenv from "dotenv";
import path from "path";
import { spawnSync } from "node:child_process";

function hasEnv(name: string): boolean {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

function ensureReactServerCondition(): void {
  const hasReactServerCondition =
    process.execArgv.includes("--conditions=react-server") ||
    (process.env.NODE_OPTIONS ?? "").includes("--conditions=react-server");

  if (hasReactServerCondition || process.env.TIGERHIRE_SCORE_CLI_RELAUNCHED === "1") {
    return;
  }

  const nodeOptions = `${process.env.NODE_OPTIONS ?? ""} --conditions=react-server`.trim();
  const result = spawnSync("npx", ["tsx", ...process.argv.slice(1)], {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOptions,
      TIGERHIRE_SCORE_CLI_RELAUNCHED: "1",
    },
  });

  process.exit(result.status ?? 1);
}

type ParsedArgs = {
  jobId: string | null;
  title: string | null;
  organisationId: string | null;
  dryRun: boolean;
};

function parseArgs(argv: string[]): ParsedArgs {
  let jobId: string | null = null;
  let title: string | null = null;
  let organisationId: string | null = null;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--job") jobId = argv[++i] ?? null;
    else if (argv[i] === "--title") title = argv[++i] ?? null;
    else if (argv[i] === "--organisation-id") organisationId = argv[++i] ?? null;
    else if (argv[i] === "--dry-run") dryRun = true;
  }

  if (!jobId && !title) {
    console.error(
      "Usage: npx tsx scripts/rescore-job-all-candidates.ts --job <uuid> | --title <substring> [--organisation-id <uuid>] [--dry-run]",
    );
    process.exit(1);
  }

  if (jobId && title) {
    console.error("Pass either --job or --title, not both.");
    process.exit(1);
  }

  return { jobId, title, organisationId, dryRun };
}

async function resolveJob(
  admin: import("@supabase/supabase-js").SupabaseClient,
  args: ParsedArgs,
): Promise<{ id: string; title: string }> {
  if (args.jobId) {
    const { data, error } = await admin
      .from("jobs")
      .select("id, title")
      .eq("id", args.jobId)
      .single();
    if (error || !data) {
      console.error("Job not found:", error?.message ?? args.jobId);
      process.exit(1);
    }
    return { id: String(data.id), title: String(data.title) };
  }

  let q = admin
    .from("jobs")
    .select("id, title, organisation_id")
    .ilike("title", `%${args.title}%`)
    .limit(25);

  if (args.organisationId) {
    q = q.eq("organisation_id", args.organisationId);
  }

  const { data: rows, error } = await q;
  if (error) {
    console.error("Failed to list jobs:", error.message);
    process.exit(1);
  }
  if (!rows?.length) {
    console.error(`No job matching title ilike %${args.title}%`);
    process.exit(1);
  }
  if (rows.length > 1) {
    console.error(
      `Multiple jobs (${rows.length}) match --title "${args.title}". Use --job <uuid> or narrow with --organisation-id.\n`,
    );
    for (const r of rows) {
      console.error(`  ${r.id}  |  ${r.title}  |  org ${r.organisation_id}`);
    }
    process.exit(1);
  }

  const row = rows[0];
  return { id: String(row.id), title: String(row.title) };
}

async function collectCandidateIds(
  admin: import("@supabase/supabase-js").SupabaseClient,
  jobId: string,
): Promise<string[]> {
  const [{ data: pipelineRows, error: pcErr }, { data: appRows, error: appErr }] =
    await Promise.all([
      admin.from("pipeline_candidates").select("candidate_id").eq("job_id", jobId),
      admin.from("applications").select("candidate_id").eq("job_id", jobId),
    ]);

  if (pcErr) throw new Error(`pipeline_candidates: ${pcErr.message}`);
  if (appErr) throw new Error(`applications: ${appErr.message}`);

  const ids = new Set<string>();
  for (const r of pipelineRows ?? []) {
    const id = (r as { candidate_id: string }).candidate_id;
    if (id) ids.add(id);
  }
  for (const r of appRows ?? []) {
    const id = (r as { candidate_id: string | null }).candidate_id;
    if (id) ids.add(id);
  }
  return [...ids];
}

async function main() {
  ensureReactServerCondition();
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
  dotenv.config({ path: path.resolve(process.cwd(), ".env") });

  if (!hasEnv("NEXT_PUBLIC_SUPABASE_URL") || !hasEnv("SUPABASE_SERVICE_ROLE_KEY")) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  if (!hasEnv("ANTHROPIC_API_KEY")) {
    console.error("Missing ANTHROPIC_API_KEY");
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));

  const [
    { createSupabaseAdmin },
    { FitScoreService },
    { getJdBaseByJobId },
    { invalidateFitScoreCache },
  ] = await Promise.all([
    import("@/lib/supabase/admin"),
    import("@/lib/services/FitScoreService"),
    import("@/lib/fitscore/hybrid/jd-base"),
    import("@/lib/redis/fitscore-cache"),
  ]);

  const admin = createSupabaseAdmin();
  const job = await resolveJob(admin, args);

  const jdBase = await getJdBaseByJobId(admin, job.id);
  if (!jdBase?.approvedBy) {
    console.error("JD Base must exist and be HM-approved for hybrid scoring on this job.");
    process.exit(1);
  }

  const candidateIds = await collectCandidateIds(admin, job.id);
  candidateIds.sort();

  console.log("\n=== Rescore FitScore for all candidates on one job ===\n");
  console.log(`Job:          ${job.title} (${job.id})`);
  console.log(`Candidates:   ${candidateIds.length} unique (pipeline ∪ applications)`);
  console.log(
    `Dry run:      ${args.dryRun ? "yes (no scores written)" : "no (writes fit_scores)"}\n`,
  );

  if (candidateIds.length === 0) {
    console.log("Nothing to rescore.");
    return;
  }

  if (args.dryRun) {
    for (const id of candidateIds) {
      console.log(`  ${id}`);
    }
    console.log("");
    return;
  }

  await Promise.all(
    candidateIds.map((candidateId) => invalidateFitScoreCache(candidateId, job.id)),
  );

  const batchResult = await FitScoreService.computeBatch(admin, job.id, candidateIds, {
    onUnapprovedJdBase: "throw",
    source: "script",
    force: true,
  });

  console.log(`Scored: ${batchResult.scored}  Failed: ${batchResult.failed}`);
  if (batchResult.failedCandidateIds.length > 0) {
    console.log("\nFailures:");
    for (const f of batchResult.failedCandidateIds) {
      console.log(`  ${f.candidateId}: ${f.error}`);
    }
  }
  console.log("");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

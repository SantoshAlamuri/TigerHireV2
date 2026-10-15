/**
 * Backfill pipeline stage for candidates who have a FitScore but are still on Applied.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/advance-scored-applied-pipeline.ts --title "QA Engineer"
 *   npx tsx --env-file=.env.local scripts/advance-scored-applied-pipeline.ts --job <job-uuid>
 */

import dotenv from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { advanceScoredPipelineCandidatesForJob } from "../src/lib/pipeline/advance-after-fitscore";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

async function main() {
  const args = process.argv.slice(2);
  let jobId: string | null = null;
  let title: string | null = null;
  let orgId: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--job" && args[i + 1]) jobId = args[++i];
    else if (args[i] === "--title" && args[i + 1]) title = args[++i];
    else if (args[i] === "--organisation-id" && args[i + 1]) orgId = args[++i];
  }

  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  if (!jobId && title) {
    let q = supabase.from("jobs").select("id, title").ilike("title", `%${title}%`);
    if (orgId) q = q.eq("organisation_id", orgId);
    const { data: job, error } = await q
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!job?.id) throw new Error(`No job matching title "${title}"`);
    jobId = job.id as string;
    console.log(`Job: ${job.title} (${jobId})`);
  }

  if (!jobId) {
    console.error(
      'Usage: npx tsx --env-file=.env.local scripts/advance-scored-applied-pipeline.ts --title "QA Engineer"',
    );
    process.exit(1);
  }

  const result = await advanceScoredPipelineCandidatesForJob(jobId);
  console.log(
    JSON.stringify(
      {
        jobId,
        examined: result.examined,
        advanced: result.advanced,
        skippedSample: result.skipped.slice(0, 10),
        skippedTotal: result.skipped.length,
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

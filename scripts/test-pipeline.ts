/**
 * Run the agent pipeline for a fixed job (direct lib call, no HTTP/auth).
 *
 * Usage:
 *   npx tsx scripts/test-pipeline.ts
 *
 * Loads `.env.local`. Uses:
 *   - SUPABASE_SERVICE_ROLE_KEY (required)
 *   - SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_INTERNAL_URL) — same as admin client
 *
 * Pipeline uses `createSupabaseAdmin()` internally; we also create a service-role client here
 * to query `fit_scores` after the run.
 *
 * Uses `forceRescore: true` so screening recomputes instead of returning a cached row.
 */

import * as dotenv from "dotenv";
import * as path from "node:path";
import { createClient } from "@supabase/supabase-js";

import {
  resolveCandidateIdsForJob,
  runPipelineForJob as runPipeline,
} from "@/lib/agents/run-pipeline";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

/** Align with `createSupabaseAdmin`: internal URL wins, then public; bridge `SUPABASE_URL` if needed. */
function resolveSupabaseUrl(): string {
  const internal = process.env.SUPABASE_INTERNAL_URL?.trim();
  if (internal) return internal;

  const nextPublic = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (nextPublic) return nextPublic;

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  if (supabaseUrl) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
    return supabaseUrl;
  }

  throw new Error(
    "Missing Supabase URL: set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_INTERNAL_URL) in .env.local",
  );
}

const JOB_ID = "2c3e71af-8693-444a-b600-8af984ac9109";
const MAX_CANDIDATES = 1;

async function main() {
  const url = resolveSupabaseUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { ids: processedCandidateIds } = await resolveCandidateIdsForJob(JOB_ID, MAX_CANDIDATES);
  console.log("\n--- candidate(s) selected for this run (same order as pipeline) ---\n");
  console.log(JSON.stringify(processedCandidateIds, null, 2));

  console.log("\n--- runPipeline result ---\n");
  const result = await runPipeline(JOB_ID, {
    maxCandidates: MAX_CANDIDATES,
    forceRescore: true,
  });
  console.log(JSON.stringify(result, null, 2));

  console.log("\n--- fit_scores for this job + candidate(s) this run selected ---\n");
  if (processedCandidateIds.length === 0) {
    console.log("No candidate IDs resolved for this job (empty pool).");
  } else {
    const { data: touchedRows, error: touchedErr } = await supabase
      .from("fit_scores")
      .select("*")
      .eq("job_id", JOB_ID)
      .in("candidate_id", processedCandidateIds)
      .order("created_at", { ascending: false });

    if (touchedErr) {
      console.error("fit_scores query failed:", touchedErr.message);
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(touchedRows ?? [], null, 2));
  }

  const sinceIso = new Date(Date.now() - 60_000).toISOString();
  console.log("\n--- fit_scores inserted in the last 60s (created_at only) ---\n");
  console.log(`(since ${sinceIso})\n`);

  const { data: rows, error } = await supabase
    .from("fit_scores")
    .select("*")
    .eq("job_id", JOB_ID)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fit_scores query failed:", error.message);
    process.exitCode = 1;
    return;
  }

  if (!rows?.length) {
    console.log(
      "No rows with new created_at in this window (rescoring updates an existing row; see section above).",
    );
  } else {
    console.log(JSON.stringify(rows, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

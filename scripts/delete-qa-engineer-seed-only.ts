/**
 * Delete ONLY QA Engineer seed/demo candidates — never uploaded profiles.
 *
 * Seed markers (all must match job applications):
 * - email ends with @seed-qa.tigerhire.demo
 * - OR entry_path = seed-script-qa-engineer
 * - OR name matches "Seed QA Candidate %"
 *
 * Usage:
 *   npx tsx scripts/delete-qa-engineer-seed-only.ts --job <uuid>
 *   npx tsx scripts/delete-qa-engineer-seed-only.ts --title "QA Engineer" --dry-run
 */

import dotenv from "dotenv";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SEED_SOURCE = "seed-script-qa-engineer";
const EMAIL_DOMAIN = "seed-qa.tigerhire.demo";

type ParsedArgs = {
  jobId: string | null;
  title: string | null;
  organisationId: string | null;
  dryRun: boolean;
};

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function parseArgs(argv: string[]): ParsedArgs {
  let jobId: string | null = null;
  let title: string | null = "QA Engineer";
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
      "Usage: npx tsx scripts/delete-qa-engineer-seed-only.ts --job <uuid> | --title <substring> [--dry-run]",
    );
    process.exit(1);
  }

  return { jobId, title, organisationId, dryRun };
}

function isSeedCandidate(row: {
  email?: string | null;
  entry_path?: string | null;
  name?: string | null;
  full_name?: string | null;
}): boolean {
  const email = String(row.email ?? "").toLowerCase();
  if (email.endsWith(`@${EMAIL_DOMAIN}`)) return true;
  if (row.entry_path === SEED_SOURCE) return true;
  const name = String(row.full_name ?? row.name ?? "");
  if (/^Seed QA Candidate\s+\d+$/i.test(name.trim())) return true;
  return false;
}

async function resolveJob(
  supabase: SupabaseClient,
  args: ParsedArgs,
): Promise<{ id: string; title: string }> {
  if (args.jobId) {
    const { data, error } = await supabase
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

  let q = supabase
    .from("jobs")
    .select("id, title, organisation_id")
    .ilike("title", `%${args.title}%`)
    .limit(25);
  if (args.organisationId) q = q.eq("organisation_id", args.organisationId);

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
    console.error(`Multiple jobs match --title "${args.title}". Use --job <uuid>.\n`);
    for (const r of rows) console.error(`  ${r.id}  |  ${r.title}`);
    process.exit(1);
  }
  return { id: String(rows[0]!.id), title: String(rows[0]!.title) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const job = await resolveJob(supabase, args);

  const { data: appRows, error: appErr } = await supabase
    .from("applications")
    .select("candidate_id")
    .eq("job_id", job.id);
  if (appErr) throw new Error(`applications: ${appErr.message}`);

  const { data: pcRows, error: pcErr } = await supabase
    .from("pipeline_candidates")
    .select("candidate_id")
    .eq("job_id", job.id);
  if (pcErr) throw new Error(`pipeline_candidates: ${pcErr.message}`);

  const candidateIds = [
    ...new Set([
      ...(appRows ?? []).map((r) => r.candidate_id as string),
      ...(pcRows ?? []).map((r) => r.candidate_id as string),
    ]),
  ].filter(Boolean);

  if (candidateIds.length === 0) {
    console.log("No candidates on this job.");
    return;
  }

  const { data: candidates, error: candErr } = await supabase
    .from("candidates")
    .select("id, name, full_name, email, entry_path")
    .in("id", candidateIds);
  if (candErr) throw new Error(`candidates: ${candErr.message}`);

  const seedRows = (candidates ?? []).filter((c) => isSeedCandidate(c));
  const uploadedRows = (candidates ?? []).filter((c) => !isSeedCandidate(c));
  const seedIds = seedRows.map((r) => r.id as string);

  console.log("\n=== Delete QA Engineer seed candidates only ===\n");
  console.log(`Job:              ${job.title} (${job.id})`);
  console.log(`On job (total):   ${candidateIds.length}`);
  console.log(`Seed (delete):    ${seedIds.length}`);
  console.log(`Uploaded (keep):  ${uploadedRows.length}`);
  console.log(`Dry run:          ${args.dryRun ? "yes" : "no"}\n`);

  if (seedRows.length > 0) {
    console.log("Seed candidates to remove:");
    for (const r of seedRows) {
      console.log(`  ${r.id}  ${r.full_name ?? r.name}  ${r.email ?? ""}`);
    }
    console.log("");
  }

  if (uploadedRows.length > 0) {
    console.log("Uploaded candidates (unchanged):");
    for (const r of uploadedRows.slice(0, 15)) {
      console.log(`  ${r.id}  ${r.full_name ?? r.name}  ${r.email ?? ""}`);
    }
    if (uploadedRows.length > 15) {
      console.log(`  ... and ${uploadedRows.length - 15} more`);
    }
    console.log("");
  }

  if (seedIds.length === 0) {
    console.log("Nothing to delete.");
    return;
  }

  if (args.dryRun) {
    console.log("[dry-run] No rows deleted.");
    return;
  }

  await supabase.from("vouches").delete().in("candidate_id", seedIds);
  await supabase.from("fit_scores").delete().in("candidate_id", seedIds);
  await supabase.from("pipeline_candidates").delete().in("candidate_id", seedIds);
  await supabase.from("applications").delete().in("candidate_id", seedIds);
  const { error: delErr } = await supabase.from("candidates").delete().in("id", seedIds);
  if (delErr) throw new Error(`delete candidates: ${delErr.message}`);

  console.log(`Deleted ${seedIds.length} seed candidate(s). Uploaded profiles were not touched.\n`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

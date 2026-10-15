import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getJdBaseByJobId, runHybridFitScorePipeline } from "@/lib/fitscore/hybrid";
import type { CandidateData, JobData } from "@/lib/fitscore/types";

type AffectedJob = {
  job_id: string;
  title: string | null;
  legacy_scores: number;
};

const FITSCORE_JOB_COLUMNS =
  "id, title, description, location, status, compensation_min, compensation_max, organisation_id, skills_required";
const FITSCORE_CANDIDATE_COLUMNS =
  "id, name, full_name, skills, experience_years, location, intent_score, resume_url, cv_url, cv_raw_text, current_role, current_company, seniority_level, updated_at";

function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function listAffectedJobs(supabase: SupabaseClient): Promise<AffectedJob[]> {
  const { data: fitScores, error: fitScoresError } = await supabase
    .from("fit_scores")
    .select("job_id")
    .eq("scoring_version", 1)
    .eq("scoring_status", "scored")
    .or("is_test_run.eq.false,is_test_run.is.null")
    .is("superseded_at", null);
  if (fitScoresError) throw fitScoresError;

  const counts = new Map<string, number>();
  for (const row of fitScores ?? []) {
    const jobId = String(row.job_id ?? "");
    if (!jobId) continue;
    counts.set(jobId, (counts.get(jobId) ?? 0) + 1);
  }
  const jobIds = Array.from(counts.keys());
  if (jobIds.length === 0) return [];

  const { data: jdBases, error: jdError } = await supabase
    .from("jd_base_documents")
    .select("job_id, approved_by")
    .in("job_id", jobIds);
  if (jdError) throw jdError;
  const approvedJobIds = new Set(
    (jdBases ?? [])
      .filter((row) => typeof row.approved_by === "string" && row.approved_by.length > 0)
      .map((row) => String(row.job_id)),
  );

  const approvedIds = jobIds.filter((id) => approvedJobIds.has(id));
  if (approvedIds.length === 0) return [];

  const { data: jobs, error: jobsError } = await supabase
    .from("jobs")
    .select("id, title")
    .in("id", approvedIds);
  if (jobsError) throw jobsError;
  const titleById = new Map(
    (jobs ?? []).map((row) => [String(row.id), row.title as string | null]),
  );

  return approvedIds
    .map((jobId) => ({
      job_id: jobId,
      title: titleById.get(jobId) ?? null,
      legacy_scores: counts.get(jobId) ?? 0,
    }))
    .sort((a, b) => b.legacy_scores - a.legacy_scores);
}

async function listAffectedPairsForJob(supabase: SupabaseClient, jobId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("fit_scores")
    .select("candidate_id")
    .eq("job_id", jobId)
    .eq("scoring_version", 1)
    .eq("scoring_status", "scored")
    .or("is_test_run.eq.false,is_test_run.is.null")
    .is("superseded_at", null);
  if (error) throw error;
  return [...new Set((data ?? []).map((row) => String(row.candidate_id ?? "")).filter(Boolean))];
}

async function runBackfillForJob(
  supabase: SupabaseClient,
  jobId: string,
  candidateIds: string[],
): Promise<{ scored: number; failed: number }> {
  const { data: job } = await supabase
    .from("jobs")
    .select(FITSCORE_JOB_COLUMNS)
    .eq("id", jobId)
    .single();
  if (!job) throw new Error(`Job not found: ${jobId}`);

  const jdBase = await getJdBaseByJobId(supabase, jobId);
  if (!jdBase?.approvedBy) {
    throw new Error(`JD Base not approved for job ${jobId}`);
  }

  const { data: candidates } = await supabase
    .from("candidates")
    .select(FITSCORE_CANDIDATE_COLUMNS)
    .in("id", candidateIds);
  const byId = new Map((candidates ?? []).map((c) => [String(c.id), c as CandidateData]));

  let scored = 0;
  let failed = 0;
  for (const candidateId of candidateIds) {
    const candidate = byId.get(candidateId);
    if (!candidate) {
      failed += 1;
      console.log(`  skip ${candidateId}: candidate missing`);
      continue;
    }
    try {
      await runHybridFitScorePipeline(supabase, {
        job: job as JobData,
        candidate,
        jdBase,
        saveToDb: true,
      });
      scored += 1;
    } catch (error) {
      failed += 1;
      console.log(
        `  fail ${candidateId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return { scored, failed };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const supabase = createAdminClient();
  const jobs = await listAffectedJobs(supabase);

  if (jobs.length === 0) {
    console.log("No approved jobs with legacy three-stage production scores found.");
    return;
  }

  console.log(`Found ${jobs.length} affected jobs.`);
  for (const job of jobs) {
    console.log(`- ${job.job_id} (${job.title ?? "untitled"}): ${job.legacy_scores} legacy scores`);
  }

  if (!apply) {
    const totalCandidates = jobs.reduce((sum, j) => sum + j.legacy_scores, 0);
    console.log(`\nDry run summary: will insert ${totalCandidates} new hybrid rows.`);
    console.log(`Dry run summary: will supersede up to ${totalCandidates} legacy active rows.`);
    console.log("Dry run only. Re-run with --apply to execute reconciliation.");
    return;
  }

  let totalScored = 0;
  let totalFailed = 0;
  for (const job of jobs) {
    const candidateIds = await listAffectedPairsForJob(supabase, job.job_id);
    const summary = await runBackfillForJob(supabase, job.job_id, candidateIds);
    totalScored += summary.scored;
    totalFailed += summary.failed;
    console.log(
      `Reconciled ${job.job_id}: processed=${candidateIds.length}, scored=${summary.scored}, failed=${summary.failed}`,
    );
  }
  console.log(`Backfill complete: scored=${totalScored}, failed=${totalFailed}`);
}

void main().catch((error) => {
  console.error("Backfill failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});

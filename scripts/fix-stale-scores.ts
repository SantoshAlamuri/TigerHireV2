import dotenv from "dotenv";
import path from "path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function main() {
  const { getJdBaseByJobId } = await import("../src/lib/fitscore/hybrid/jd-base");

  const jobId = "8f548bf7-26a3-454e-b5d0-43b04d326f59";

  const { data: staleScores } = await admin
    .from("fit_scores")
    .select("candidate_id, v2_extraction")
    .eq("job_id", jobId)
    .eq("is_test_run", false);

  const staleIds = (staleScores ?? [])
    .filter((s) => {
      const ext = s.v2_extraction as Record<string, unknown> | null;
      const ds = (ext as any)?.dimension_scores;
      if (!ds) return true;
      return Object.keys(ds).some((k: string) =>
        ["sm_years", "technical", "team_scale"].includes(k),
      );
    })
    .map((s) => s.candidate_id);

  console.log(`Stale candidates to fix: ${staleIds.length}`);
  if (staleIds.length === 0) {
    console.log("Nothing to fix.");
    return;
  }

  const jdBase = await getJdBaseByJobId(admin, jobId);
  if (!jdBase) {
    console.error("No JD Base for job");
    return;
  }
  console.log(`JD Base dims: ${Object.keys(jdBase.weights).join(", ")}`);

  const { data: job } = await admin.from("jobs").select("*").eq("id", jobId).single();
  if (!job) {
    console.error("Job not found");
    return;
  }

  for (const cid of staleIds) {
    const { data: candidate } = await admin.from("candidates").select("*").eq("id", cid).single();
    if (!candidate) {
      console.log(`SKIP ${cid}`);
      continue;
    }

    try {
      const { FitScoreService } = await import("../src/lib/services/FitScoreService");
      const result = await FitScoreService.computeSingle(admin, job.id, candidate.id, {
        saveToDb: true,
        source: "script",
        force: true,
        onUnapprovedJdBase: "throw",
      });
      if (!result || typeof result !== "object" || !("fitScore" in result)) continue;
      const hybrid = result as { fitScore: number; fitLabel: string };
      console.log(`${candidate.full_name}: ${hybrid.fitScore} (${hybrid.fitLabel})`);

      const { data: check } = await admin
        .from("fit_scores")
        .select("overall_score, v2_extraction")
        .eq("job_id", jobId)
        .eq("candidate_id", cid)
        .eq("is_test_run", false)
        .single();
      const savedDims = Object.keys((check?.v2_extraction as any)?.dimension_scores ?? {});
      console.log(`  DB verified: score=${check?.overall_score}, dims=${savedDims.join(", ")}`);
    } catch (err) {
      console.log(`FAIL ${candidate.full_name}: ${(err as Error).message?.slice(0, 100)}`);
    }
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

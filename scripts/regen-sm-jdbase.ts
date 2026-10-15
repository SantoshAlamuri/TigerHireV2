/**
 * Regenerate JD Bases for Scrum Master jobs via LLM (not template)
 * and rescore all candidates.
 */
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
  const { generateJdBaseDocument } = await import("../src/lib/fitscore/hybrid/jd-base");
  const { runHybridFitScorePipeline } = await import("../src/lib/fitscore/hybrid/pipeline");

  const smJobIds = ["8f548bf7-26a3-454e-b5d0-43b04d326f59", "01a34316-0f4c-4d6e-b305-0d062531a0d7"];

  for (const jobId of smJobIds) {
    const { data: job } = await admin.from("jobs").select("*").eq("id", jobId).single();
    if (!job) {
      console.log(`Job ${jobId} not found`);
      continue;
    }

    console.log(`\n=== ${job.title} (${jobId.slice(0, 8)}) — LLM regeneration ===`);

    await admin.from("jd_base_documents").delete().eq("job_id", jobId);
    console.log("  Deleted old template-based JD Base");

    const jdBase = await generateJdBaseDocument(admin, job);
    console.log(`  New dimensions: ${JSON.stringify(jdBase.weights, null, 2)}`);
    console.log(`  Context: ${jdBase.context}`);

    const { data: scores } = await admin
      .from("fit_scores")
      .select("candidate_id")
      .eq("job_id", jobId)
      .eq("is_test_run", false);

    if (!scores?.length) {
      console.log("  No candidates");
      continue;
    }
    const candidateIds = [...new Set(scores.map((s: { candidate_id: string }) => s.candidate_id))];
    console.log(`  Rescoring ${candidateIds.length} candidates...`);

    const { data: candidates } = await admin.from("candidates").select("*").in("id", candidateIds);
    const cMap = new Map((candidates ?? []).map((c: { id: string }) => [c.id, c]));

    for (let b = 0; b < candidateIds.length; b += 5) {
      const chunk = candidateIds.slice(b, b + 5);
      const results = await Promise.allSettled(
        chunk.map(async (cid) => {
          const candidate = cMap.get(cid);
          if (!candidate) throw new Error("Not found");
          return runHybridFitScorePipeline(admin, { job, candidate, jdBase, saveToDb: true });
        }),
      );
      for (let i = 0; i < results.length; i++) {
        const name = (cMap.get(chunk[i]) as any)?.full_name ?? chunk[i].slice(0, 8);
        const r = results[i];
        if (r.status === "fulfilled") {
          console.log(`  ${name}: ${r.value.fitScore} (${r.value.fitLabel})`);
        } else {
          console.log(`  FAIL ${name}: ${(r.reason as Error).message?.slice(0, 100)}`);
        }
      }
    }
  }
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

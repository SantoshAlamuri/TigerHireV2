/**
 * One-time rescore: regenerate all fit_scores using hybrid v2 pipeline.
 * Runs candidates in parallel batches of 5 for speed.
 *
 * Usage:
 *   npx tsx scripts/rescore-hybrid-v2.ts                    # real jobs only
 *   npx tsx scripts/rescore-hybrid-v2.ts --all              # all jobs including load-test
 *   npx tsx scripts/rescore-hybrid-v2.ts --job <job-id>     # single job
 *   npx tsx scripts/rescore-hybrid-v2.ts --force-jdbase     # regenerate all JD Bases from templates
 *
 * Requires ANTHROPIC_API_KEY and SUPABASE_SERVICE_ROLE_KEY in .env / .env.local.
 */

import dotenv from "dotenv";
import path from "path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const LOAD_TEST_PREFIX = "[Load ";
const NOTIFY_TEST_PREFIX = "[NotifyTest]";
const CONCURRENCY = 5;

async function main() {
  const args = process.argv.slice(2);
  const includeAll = args.includes("--all");
  const forceRegenJdBase = args.includes("--force-jdbase");
  const singleJobIdx = args.indexOf("--job");
  const singleJobId = singleJobIdx >= 0 ? args[singleJobIdx + 1] : null;

  const { generateJdBaseDocument, getJdBaseByJobId, upsertJdBaseFromTemplate } =
    await import("../src/lib/fitscore/hybrid/jd-base");
  const { findBestIndiaTemplate } = await import("../src/lib/fitscore/hybrid/jd-india-templates");
  const { buildJdText } = await import("../src/lib/fitscore/job-text");
  const { runHybridFitScorePipeline } = await import("../src/lib/fitscore/hybrid/pipeline");

  let jobQuery = admin.from("jobs").select("*");
  if (singleJobId) jobQuery = jobQuery.eq("id", singleJobId);
  const { data: jobs, error: jobErr } = await jobQuery;
  if (jobErr) {
    console.error("Failed to load jobs:", jobErr.message);
    process.exit(1);
  }

  const targetJobs = (jobs ?? []).filter((j: { title: string; id: string }) => {
    if (singleJobId) return j.id === singleJobId;
    if (includeAll) return true;
    return !j.title.startsWith(LOAD_TEST_PREFIX) && !j.title.startsWith(NOTIFY_TEST_PREFIX);
  });

  console.log(`\n=== Hybrid v2 Rescore (concurrency: ${CONCURRENCY}) ===`);
  console.log(`Target jobs: ${targetJobs.length}${includeAll ? " (all)" : " (real only)"}\n`);

  let totalScored = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const job of targetJobs) {
    console.log(`\n--- Job: ${job.title} (${job.id}) ---`);

    let jdBase = forceRegenJdBase ? null : await getJdBaseByJobId(admin, job.id);
    if (!jdBase) {
      console.log(forceRegenJdBase ? "  Regenerating JD Base..." : "  Generating JD Base...");
      try {
        const jdBlob = `${job.title}\n${buildJdText(job)}`;
        const match = findBestIndiaTemplate(jdBlob);
        if (match) {
          jdBase = await upsertJdBaseFromTemplate(admin, job, match.template);
          console.log(`  Template: ${match.template.roleTitle} (${match.template.category})`);
        } else {
          jdBase = await generateJdBaseDocument(admin, job);
          console.log(`  LLM-generated: ${jdBase.roleTitle}`);
        }
        console.log(`  Dims: ${Object.keys(jdBase.weights).join(", ")}`);
      } catch (err) {
        console.error(`  FAILED JD Base: ${err instanceof Error ? err.message : err}`);
        totalFailed++;
        continue;
      }
    } else {
      console.log(`  JD Base: ${jdBase.roleTitle} [${Object.keys(jdBase.weights).join(", ")}]`);
    }

    const { data: scores, error: scoreErr } = await admin
      .from("fit_scores")
      .select("candidate_id, scoring_version")
      .eq("job_id", job.id)
      .eq("is_test_run", false);

    if (scoreErr || !scores?.length) {
      console.log(`  No scores to rescore`);
      continue;
    }

    const alreadyV2 = new Set(
      scores
        .filter((s: { scoring_version: number }) => s.scoring_version === 2)
        .map((s: { candidate_id: string }) => s.candidate_id),
    );
    const allIds = [...new Set(scores.map((s: { candidate_id: string }) => s.candidate_id))];
    const toRescore = allIds.filter((id) => !alreadyV2.has(id));
    const skipped = allIds.length - toRescore.length;
    totalSkipped += skipped;

    console.log(
      `  Total: ${allIds.length} | Already v2: ${skipped} | To score: ${toRescore.length}`,
    );
    if (toRescore.length === 0) continue;

    const { data: candidates } = await admin.from("candidates").select("*").in("id", toRescore);

    const candidateMap = new Map((candidates ?? []).map((c: { id: string }) => [c.id, c]));

    for (let batch = 0; batch < toRescore.length; batch += CONCURRENCY) {
      const chunk = toRescore.slice(batch, batch + CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map(async (candidateId) => {
          const candidate = candidateMap.get(candidateId);
          if (!candidate) return { candidateId, status: "skip" as const, name: candidateId };
          const { FitScoreService } = await import("../src/lib/services/FitScoreService");
          const result = await FitScoreService.computeSingle(admin, job.id, candidateId, {
            saveToDb: true,
            source: "script",
            force: true,
            onUnapprovedJdBase: "throw",
          });
          if (
            result &&
            typeof result === "object" &&
            "scoring_status" in result &&
            (result as { scoring_status: string }).scoring_status === "deduped"
          ) {
            return {
              candidateId,
              status: "skip" as const,
              name: candidate.full_name ?? candidateId,
            };
          }
          if (!result || typeof result !== "object" || !("fitScore" in result)) {
            return {
              candidateId,
              status: "skip" as const,
              name: candidate.full_name ?? candidateId,
            };
          }
          return {
            candidateId,
            status: "ok" as const,
            name: candidate.full_name ?? candidateId,
            score: result.fitScore,
            label: result.fitLabel,
          };
        }),
      );

      for (let i = 0; i < results.length; i++) {
        const idx = batch + i + 1 + skipped;
        const total = allIds.length;
        const r = results[i];
        if (r.status === "fulfilled") {
          const v = r.value;
          if (v.status === "skip") {
            console.log(`  [${idx}/${total}] SKIP ${v.name}`);
            totalFailed++;
          } else {
            console.log(`  [${idx}/${total}] ${v.name}: ${v.score} (${v.label})`);
            totalScored++;
          }
        } else {
          const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
          console.log(`  [${idx}/${total}] FAIL: ${msg.slice(0, 120)}`);
          totalFailed++;
        }
      }
    }
  }

  console.log(`\n=== Done ===`);
  console.log(
    `Scored: ${totalScored} | Failed: ${totalFailed} | Skipped (already v2): ${totalSkipped}\n`,
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

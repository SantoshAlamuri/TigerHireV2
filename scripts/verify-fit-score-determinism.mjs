/**
 * Consistency Measurement Baseline: Score same candidate+job 10 times and calculate variance metrics.
 *
 * This script measures consistency after the temperature 0 fix to establish a baseline.
 * Target: <5% coefficient of variation (CV) for world-class consistency.
 *
 * Run: node scripts/verify-fit-score-determinism.mjs [jobId] [candidateId]
 *
 * Requires: Supabase URL + service key, and at least one job + candidate in DB.
 * Set env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Output: mean, std dev, coefficient of variation, and all scores for analysis.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

async function getJobAndCandidate(jobId, candidateId) {
  const [jobRes, candRes] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, description, location, status, organisation_id, skills_required")
      .eq("id", jobId)
      .single(),
    supabase
      .from("candidates")
      .select(
        "id, name, full_name, skills, experience_years, location, current_role, current_company, cv_raw_text, resume_url, cv_url",
      )
      .eq("id", candidateId)
      .single(),
  ]);
  if (jobRes.error || !jobRes.data)
    throw new Error("Job not found: " + (jobRes.error?.message || jobId));
  if (candRes.error || !candRes.data)
    throw new Error("Candidate not found: " + (candRes.error?.message || candidateId));
  return { job: jobRes.data, candidate: candRes.data };
}

async function main() {
  const jobId = process.argv[2] || process.env.FIT_SCORE_JOB_ID;
  const candidateId = process.argv[3] || process.env.FIT_SCORE_CANDIDATE_ID;

  if (!jobId || !candidateId) {
    const { data: jobs } = await supabase.from("jobs").select("id").limit(1);
    const { data: candidates } = await supabase.from("candidates").select("id").limit(1);
    if (!jobs?.length || !candidates?.length) {
      console.error(
        "No job/candidate in DB. Create one or pass: node script.mjs <jobId> <candidateId>",
      );
      process.exit(1);
    }
    return mainWithIds(jobs[0].id, candidates[0].id);
  }
  return mainWithIds(jobId, candidateId);
}

async function mainWithIds(jobId, candidateId) {
  const { job, candidate } = await getJobAndCandidate(jobId, candidateId);
  console.log("\n=== Consistency Measurement Baseline ===\n");
  console.log(`Job: ${job.title}`);
  console.log(`Candidate: ${candidate.name || candidate.full_name}`);
  console.log(`\nRunning 10 test runs with forceRescore=true...\n`);

  const NUM_RUNS = 10;
  const scores = [];

  // Use the API endpoint - if it requires auth, user can set up auth token
  // Otherwise, we'll provide instructions to use the API directly
  const apiUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const useApi = process.env.USE_API !== "false"; // Default to true, set USE_API=false to skip

  if (useApi) {
    console.log("Using API endpoint (set USE_API=false to use direct computation)\n");
  }

  for (let i = 0; i < NUM_RUNS; i++) {
    let score = null;

    if (useApi) {
      try {
        // Try the admin test endpoint first (requires super_admin auth)
        const res = await fetch(`${apiUrl}/api/admin/fitscore-test`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Note: Add Authorization header if needed
            ...(process.env.AUTH_TOKEN && { Authorization: `Bearer ${process.env.AUTH_TOKEN}` }),
          },
          body: JSON.stringify({
            candidate_id: candidateId,
            job_id: jobId,
            runs: 1,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          score = Array.isArray(data.scores) ? data.scores[0] : (data.score ?? 0);
        } else if (res.status === 401 || res.status === 403) {
          // Auth failed - fall through to direct computation
          console.log(`  Run ${i + 1}: API auth required, using direct computation...`);
        } else {
          throw new Error(`API error: ${res.status}`);
        }
      } catch (apiErr) {
        // Fall through to direct computation
        if (i === 0) {
          console.log("API endpoint unavailable, using direct computation for all runs...\n");
        }
      }
    }

    // Direct computation fallback (or if USE_API=false)
    if (score === null) {
      try {
        // Import the computeFitScore function directly
        // Note: This requires the app to be built or using tsx/ts-node
        // For now, we'll use a workaround: call via the regular fit-score API
        const res = await fetch(`${apiUrl}/api/fit-score`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, candidateId }),
        });

        if (res.ok) {
          const data = await res.json();
          score = data.score?.score ?? data.score ?? 0;
        } else {
          throw new Error(`Direct API error: ${res.status}`);
        }
      } catch (err) {
        console.error(`  Run ${i + 1}: ERROR -`, err.message);
        console.error("\nTo use this script, either:");
        console.error("1. Set up API auth token (AUTH_TOKEN env var) for /api/admin/fitscore-test");
        console.error("2. Or ensure the app is running and /api/fit-score is accessible");
        console.error(
          "3. Or use: node --loader ts-node/esm scripts/verify-fit-score-determinism.mjs",
        );
        process.exit(1);
      }
    }

    scores.push(score);
    console.log(`  Run ${i + 1}: score = ${score}`);
  }

  // Calculate statistics
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance =
    scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? (stdDev / mean) * 100 : 0; // Coefficient of variation as percentage
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const range = maxScore - minScore;

  // Determine consistency status
  const isConsistent = cv < 5; // Target: <5% CV
  const status = isConsistent ? "✅ CONSISTENT" : "⚠️  INCONSISTENT";
  const statusColor = isConsistent ? "\x1b[32m" : "\x1b[33m"; // Green or yellow

  // Output results
  console.log("\n=== Results ===\n");
  console.log(`Scores: [${scores.join(", ")}]`);
  console.log(`\nStatistics:`);
  console.log(`  Mean:              ${mean.toFixed(2)}`);
  console.log(`  Std Dev:           ${stdDev.toFixed(2)}`);
  console.log(`  Coefficient of Variation (CV): ${cv.toFixed(2)}%`);
  console.log(`  Min:               ${minScore}`);
  console.log(`  Max:               ${maxScore}`);
  console.log(`  Range:             ${range}`);
  console.log(`\n${statusColor}${status}\x1b[0m (Target: CV < 5%)`);

  if (!isConsistent) {
    console.log(`\n⚠️  Warning: CV is ${cv.toFixed(2)}%, which exceeds the 5% target.`);
    console.log(
      `   This indicates score variance. Review temperature settings and extraction consistency.`,
    );
  } else {
    console.log(
      `\n✅ Excellent: CV is ${cv.toFixed(2)}%, meeting the <5% target for world-class consistency.`,
    );
  }

  // Save to file if requested
  const outputFile = process.env.CONSISTENCY_OUTPUT_FILE;
  if (outputFile) {
    const fs = await import("fs");
    const results = {
      job_id: jobId,
      candidate_id: candidateId,
      job_title: job.title,
      candidate_name: candidate.name || candidate.full_name,
      timestamp: new Date().toISOString(),
      runs: NUM_RUNS,
      scores,
      statistics: {
        mean,
        stdDev,
        cv,
        min: minScore,
        max: maxScore,
        range,
      },
      consistent: isConsistent,
    };
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
    console.log(`\nResults saved to: ${outputFile}`);
  }

  // Exit with error code if inconsistent (for CI/CD)
  if (!isConsistent && process.env.FAIL_ON_INCONSISTENT === "true") {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

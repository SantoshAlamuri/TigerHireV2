/**
 * Re-run hybrid FitScore for one job+candidate and compare outputs for consistency.
 *
 * Default: N in-memory runs (saveToDb: false) — no DB writes. Prints Fit, Shadow, Ideal %,
 * Market % per run plus min/max/range (expect small drift; extraction uses temperature 0).
 *
 * Usage:
 *   npx tsx scripts/compare-rescore-fitscores.ts --job <uuid> --candidate <uuid>
 *   npx tsx scripts/compare-rescore-fitscores.ts --job <uuid> --candidate <uuid> --runs 5
 *   npx tsx scripts/compare-rescore-fitscores.ts --job <uuid> --candidate <uuid> --persist
 *
 * --persist: reads active fit_scores row, runs one hybrid save (supersedes prior row),
 *            prints before | after | delta for persisted columns.
 *
 * Requires .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 */

import dotenv from "dotenv";
import path from "path";
import { spawnSync } from "node:child_process";

const FITSCORE_JOB_COLUMNS =
  "id, title, description, location, status, compensation_min, compensation_max, organisation_id, skills_required";
const FITSCORE_CANDIDATE_COLUMNS =
  "id, name, full_name, skills, experience_years, location, intent_score, resume_url, cv_url, cv_raw_text, current_role, current_company, seniority_level, updated_at";

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

function parseArgs(argv: string[]): {
  jobId: string;
  candidateId: string;
  runs: number;
  persist: boolean;
} {
  let jobId = "";
  let candidateId = "";
  let runs = 3;
  let persist = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--job") jobId = argv[++i] ?? "";
    else if (argv[i] === "--candidate") candidateId = argv[++i] ?? "";
    else if (argv[i] === "--runs") runs = Math.max(1, parseInt(argv[++i] ?? "3", 10) || 3);
    else if (argv[i] === "--persist") persist = true;
  }

  if (!jobId || !candidateId) {
    console.error(
      "Usage: npx tsx scripts/compare-rescore-fitscores.ts --job <job-id> --candidate <candidate-id> [--runs N] [--persist]",
    );
    process.exit(1);
  }

  return { jobId, candidateId, runs, persist };
}

function statLabel(values: number[]): { min: number; max: number; range: number; mean: number } {
  if (values.length === 0) return { min: NaN, max: NaN, range: NaN, mean: NaN };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { min, max, range: max - min, mean };
}

type DbSnapshot = {
  id: string;
  overall_score: number | null;
  shadow_score: number | null;
  ideal_match_pct: number | null;
  market_percentile: number | null;
  scoring_version: number | null;
};

async function fetchActiveScoreRow(
  admin: import("@supabase/supabase-js").SupabaseClient,
  jobId: string,
  candidateId: string,
): Promise<DbSnapshot | null> {
  const { data, error } = await admin
    .from("fit_scores")
    .select("id, overall_score, shadow_score, ideal_match_pct, market_percentile, scoring_version")
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .or("is_test_run.eq.false,is_test_run.is.null")
    .is("superseded_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    id: String(data.id),
    overall_score: data.overall_score as number | null,
    shadow_score: data.shadow_score as number | null,
    ideal_match_pct: data.ideal_match_pct as number | null,
    market_percentile: data.market_percentile as number | null,
    scoring_version: data.scoring_version as number | null,
  };
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

  const { jobId, candidateId, runs, persist } = parseArgs(process.argv.slice(2));

  const [{ createSupabaseAdmin }, { FitScoreService }, { getJdBaseByJobId }] = await Promise.all([
    import("@/lib/supabase/admin"),
    import("@/lib/services/FitScoreService"),
    import("@/lib/fitscore/hybrid/jd-base"),
  ]);

  const admin = createSupabaseAdmin();

  const [{ data: job, error: jobErr }, { data: candidate, error: candErr }] = await Promise.all([
    admin.from("jobs").select(FITSCORE_JOB_COLUMNS).eq("id", jobId).single(),
    admin.from("candidates").select(FITSCORE_CANDIDATE_COLUMNS).eq("id", candidateId).single(),
  ]);

  if (jobErr || !job) {
    console.error("Job not found:", jobErr?.message ?? jobId);
    process.exit(1);
  }
  if (candErr || !candidate) {
    console.error("Candidate not found:", candErr?.message ?? candidateId);
    process.exit(1);
  }

  const jdBase = await getJdBaseByJobId(admin, jobId);
  if (!jdBase?.approvedBy) {
    console.error("JD Base must exist and be HM-approved for hybrid scoring.");
    process.exit(1);
  }

  const hasIcp = Boolean(jdBase.idealCandidateProfile);
  console.log("\n=== Compare / rescore FitScore (hybrid) ===\n");
  console.log(`Job:          ${job.title} (${jobId})`);
  console.log(`Candidate:    ${candidate.full_name ?? candidate.name ?? candidateId}`);
  console.log(
    `JD Base ICP:  ${hasIcp ? "yes (ideal_match_pct requested from model)" : "no (Ideal % may default to 0)"}`,
  );
  console.log(`Dry runs:     ${runs} (saveToDb: false)`);
  console.log(`Persist:      ${persist ? "yes (one write after dry runs)" : "no"}\n`);

  const fitScores: number[] = [];
  const shadowScores: number[] = [];
  const idealPcts: number[] = [];
  const marketPcts: number[] = [];

  for (let i = 0; i < runs; i++) {
    try {
      const result = await FitScoreService.computeSingle(admin, jobId, candidateId, {
        saveToDb: false,
        source: "investigation",
        force: true,
        onUnapprovedJdBase: "throw",
      });
      if (!result || typeof result !== "object" || !("fitScore" in result)) {
        throw new Error("Scoring did not return fitScore");
      }
      const hybrid = result as {
        fitScore: number;
        shadowScore: number;
        idealMatch: { ideal_match_pct: number };
        market: { percentile: number | null };
      };
      fitScores.push(hybrid.fitScore);
      shadowScores.push(hybrid.shadowScore);
      idealPcts.push(hybrid.idealMatch.ideal_match_pct);
      marketPcts.push(hybrid.market.percentile ?? hybrid.fitScore);

      console.log(
        `Run ${i + 1}/${runs}  Fit: ${hybrid.fitScore}  Shadow: ${hybrid.shadowScore}  Ideal: ${hybrid.idealMatch.ideal_match_pct}  Market: ${hybrid.market.percentile ?? "—"}`,
      );
    } catch (e) {
      console.error(`Run ${i + 1} FAILED:`, e instanceof Error ? e.message : e);
      process.exit(1);
    }
  }

  console.log("\n--- Dry-run spread ---");
  const f = statLabel(fitScores);
  const s = statLabel(shadowScores);
  const ip = statLabel(idealPcts);
  const m = statLabel(marketPcts);
  console.log(
    `Fit:    min ${f.min}  max ${f.max}  range ${f.range.toFixed(2)}  mean ${f.mean.toFixed(2)}`,
  );
  console.log(
    `Shadow: min ${s.min}  max ${s.max}  range ${s.range.toFixed(2)}  mean ${s.mean.toFixed(2)}`,
  );
  console.log(
    `Ideal:  min ${ip.min}  max ${ip.max}  range ${ip.range.toFixed(2)}  mean ${ip.mean.toFixed(2)}`,
  );
  console.log(
    `Market: min ${m.min}  max ${m.max}  range ${m.range.toFixed(2)}  mean ${m.mean.toFixed(2)}`,
  );

  if (f.range === 0 && s.range === 0 && ip.range === 0) {
    console.log("\n✓ All dry runs identical for Fit / Shadow / Ideal.");
  } else if (f.range <= 1 && s.range <= 1 && ip.range <= 1) {
    console.log("\n~ Within 1 point on key metrics (often acceptable with temperature 0).");
  } else {
    console.log("\n! Noticeable spread across runs — investigate model/provider variance.");
  }

  if (!persist) {
    console.log(
      "\n(No DB write.) Pass --persist to supersede active row and compare DB before/after.\n",
    );
    return;
  }

  const before = await fetchActiveScoreRow(admin, jobId, candidateId);
  console.log("\n--- DB before persist ---");
  console.log(before ? JSON.stringify(before, null, 2) : "(no active row)");

  await FitScoreService.computeSingle(admin, jobId, candidateId, {
    saveToDb: true,
    source: "investigation",
    force: true,
    onUnapprovedJdBase: "throw",
  });

  const after = await fetchActiveScoreRow(admin, jobId, candidateId);
  console.log("\n--- DB after persist (new active row) ---");
  console.log(after ? JSON.stringify(after, null, 2) : "(missing — check errors)");

  if (before && after) {
    console.log("\n--- Delta (after − before) ---");
    const d = (a: number | null, b: number | null) =>
      a == null || b == null ? "n/a" : String(a - b);
    console.log(`overall_score:      ${d(after.overall_score, before.overall_score)}`);
    console.log(`shadow_score:       ${d(after.shadow_score, before.shadow_score)}`);
    console.log(`ideal_match_pct:    ${d(after.ideal_match_pct, before.ideal_match_pct)}`);
    console.log(`market_percentile:  ${d(after.market_percentile, before.market_percentile)}`);
    console.log(`scoring_version:    ${after.scoring_version} (was ${before.scoring_version})`);
    console.log(`row id:             ${before.id} → ${after.id}`);
  }

  console.log("");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

import dotenv from "dotenv";
import path from "path";
import { spawnSync } from "node:child_process";

type ParsedArgs = {
  jobId: string;
  candidateId: string;
};

type ThreeStageLikeResult = {
  score: number;
  criteria_breakdown?: Array<{
    criterion_name: string;
    points_earned: number;
    grade: string;
  }>;
  one_line_summary?: string;
  provenance?: {
    rubric_id?: string;
  };
};

type HybridLikeResult = {
  fitScore: number;
  extraction: {
    dimension_scores: Record<string, number>;
  };
  explanation: string;
};

function parseArgs(argv: string[]): ParsedArgs {
  const jobIdIndex = argv.indexOf("--job-id");
  const candidateIdIndex = argv.indexOf("--candidate-id");

  const jobId = jobIdIndex >= 0 ? argv[jobIdIndex + 1] : "";
  const candidateId = candidateIdIndex >= 0 ? argv[candidateIdIndex + 1] : "";

  if (!jobId || !candidateId) {
    console.error(
      "Usage: npx tsx scripts/score-candidate.ts --job-id <job-id> --candidate-id <candidate-id>",
    );
    process.exit(1);
  }

  return { jobId, candidateId };
}

function hasEnv(name: string): boolean {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

function isHybridResult(value: unknown): value is HybridLikeResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "fitScore" in value &&
    "extraction" in value &&
    "explanation" in value
  );
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

async function main() {
  ensureReactServerCondition();
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
  dotenv.config({ path: path.resolve(process.cwd(), ".env") });

  if (!hasEnv("NEXT_PUBLIC_SUPABASE_URL") || !hasEnv("SUPABASE_SERVICE_ROLE_KEY")) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const { jobId, candidateId } = parseArgs(process.argv.slice(2));
  const [{ createSupabaseAdmin }, { FitScoreService }, { getJdBaseByJobId }] = await Promise.all([
    import("@/lib/supabase/admin"),
    import("@/lib/services/FitScoreService"),
    import("@/lib/fitscore/hybrid/jd-base"),
  ]);

  const admin = createSupabaseAdmin();
  const jdBase = await getJdBaseByJobId(admin, jobId);

  const result = await FitScoreService.computeSingle(admin, jobId, candidateId, {
    source: "script",
    force: true,
  });
  const hybridPath = isHybridResult(result);

  let rubricId = "unknown";
  let rubricRoleTitle = "unknown";

  if (hybridPath) {
    rubricId = jdBase?.id ?? "unknown";
    rubricRoleTitle = jdBase?.roleTitle ?? "unknown";
  } else {
    const threeStageResult = result as ThreeStageLikeResult;
    rubricId = threeStageResult.provenance?.rubric_id ?? "unknown";

    const { data: rubricRow } = await admin
      .from("fit_score_rubrics")
      .select("role_intelligence")
      .eq("job_id", jobId)
      .maybeSingle();

    const roleIntelligence = rubricRow?.role_intelligence as { role_title?: string } | null;
    rubricRoleTitle = roleIntelligence?.role_title ?? "unknown";
  }

  const { data: scoreRow } = await admin
    .from("fit_scores")
    .select("dimension_reasoning, v2_explanation, one_line_summary")
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .eq("is_test_run", false)
    .maybeSingle();

  const routeUsed = hybridPath ? "hybrid_v2" : "three_stage";
  const overallScore = hybridPath ? result.fitScore : (result as ThreeStageLikeResult).score;

  const rationaleText = hybridPath
    ? ((scoreRow?.v2_explanation as string | null) ?? result.explanation)
    : ((scoreRow?.dimension_reasoning as string | null) ??
      (result as ThreeStageLikeResult).one_line_summary ??
      (scoreRow?.one_line_summary as string | null) ??
      "");

  console.log(`Route: ${routeUsed}`);
  console.log(`Rubric: ${rubricId} | ${rubricRoleTitle}`);
  console.log(`Overall Score: ${overallScore}`);
  console.log("");
  console.log("Dimensions:");

  if (hybridPath) {
    for (const [dimension, score] of Object.entries(result.extraction.dimension_scores)) {
      console.log(`- ${dimension}: ${score}`);
    }
  } else {
    const dimensions = (result as ThreeStageLikeResult).criteria_breakdown ?? [];
    for (const dimension of dimensions) {
      console.log(
        `- ${dimension.criterion_name}: ${dimension.points_earned} (grade ${dimension.grade})`,
      );
    }
  }

  console.log("");
  console.log("Rationale:");
  console.log(rationaleText || "(empty)");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to score candidate: ${message}`);
  process.exit(1);
});

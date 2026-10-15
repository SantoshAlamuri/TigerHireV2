/**
 * Force-rescore 8 QA validation candidates and print three-score columns.
 * Usage: FF_FITSCORE_BLEND_V2=true npx tsx scripts/rescore-qa-eight-verify.ts
 */
import dotenv from "dotenv";
import path from "path";
import { spawnSync } from "node:child_process";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const JOB_ID = "861e8c58-9c72-4c46-8534-a02207a35cbc";

const CANDIDATES = [
  { id: "134a9416-952a-46e6-b265-245f33da3401", label: "Preethi" },
  { id: "e51881a3-461b-42c4-afcf-455101cf46c5", label: "Dhanush" },
  { id: "3ffb4e92-2467-4cee-ab5c-605032cedb48", label: "Subramanian" },
  { id: "30a7e854-53d4-43ed-b5e0-9c4e1817061e", label: "Arulmani" },
  { id: "d5c8a827-2418-411a-94fc-41501708dfef", label: "Prashanth" },
  { id: "47478384-9508-4a4d-9dda-63065a653398", label: "Vilas" },
  { id: "ea3b7abd-5504-4e00-abb5-6a8df5d2c73f", label: "Niranjan" },
  { id: "2d6a94ef-4a45-48ce-92b2-fe2ac77895cf", label: "Pratibha" },
];

function ensureReactServerCondition(): void {
  const has =
    process.execArgv.includes("--conditions=react-server") ||
    (process.env.NODE_OPTIONS ?? "").includes("--conditions=react-server");
  if (has || process.env.TIGERHIRE_SCORE_CLI_RELAUNCHED === "1") return;
  const nodeOptions = `${process.env.NODE_OPTIONS ?? ""} --conditions=react-server`.trim();
  const result = spawnSync("npx", ["tsx", ...process.argv.slice(1)], {
    stdio: "inherit",
    env: { ...process.env, NODE_OPTIONS: nodeOptions, TIGERHIRE_SCORE_CLI_RELAUNCHED: "1" },
  });
  process.exit(result.status ?? 1);
}

async function main() {
  ensureReactServerCondition();
  const { createSupabaseAdmin } = await import("@/lib/supabase/admin");
  const { FitScoreService, numericOverallFromFitScoreServiceResult } =
    await import("@/lib/services/FitScoreService");
  const admin = createSupabaseAdmin();

  console.log("\nFF_FITSCORE_BLEND_V2 =", process.env.FF_FITSCORE_BLEND_V2 ?? "(unset)");
  console.log("\n| Candidate | FitScore | primary | shadow | ICP % | Market % |\n");

  for (const c of CANDIDATES) {
    process.stdout.write(`${c.label} scoring... `);
    await FitScoreService.computeSingle(admin, JOB_ID, c.id, {
      source: "script",
      force: true,
      saveToDb: true,
      onUnapprovedJdBase: "throw",
    });
    const { data: row } = await admin
      .from("fit_scores")
      .select(
        "overall_score, primary_score, shadow_score, ideal_match_pct, market_percentile, market_label",
      )
      .eq("job_id", JOB_ID)
      .eq("candidate_id", c.id)
      .eq("is_test_run", false)
      .is("superseded_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    console.log("done");
    console.log(
      `| ${c.label.padEnd(11)} | ${String(row?.overall_score ?? "—").padEnd(8)} | ${String(row?.primary_score ?? "—").padEnd(7)} | ${String(row?.shadow_score ?? "—").padEnd(6)} | ${String(row?.ideal_match_pct ?? "—").padEnd(5)} | ${row?.market_percentile ?? "—"} |`,
    );
  }
  console.log("\nDone.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

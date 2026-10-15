/**
 * Reprocess Anuja (failed .docx agency upload) on QA Engineer job.
 * Usage: npx tsx scripts/reprocess-anuja.ts
 */
import dotenv from "dotenv";
import path from "path";
import { spawnSync } from "node:child_process";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const JOB_ID = "861e8c58-9c72-4c46-8534-a02207a35cbc";

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
  const { reprocessAgencyCandidate } = await import("@/lib/agency/reprocess-candidate");
  const admin = createSupabaseAdmin();

  const { data: pipeline } = await admin
    .from("pipeline_candidates")
    .select("candidate_id")
    .eq("job_id", JOB_ID);

  const ids = (pipeline ?? []).map((p: { candidate_id: string }) => p.candidate_id);
  if (ids.length === 0) {
    console.error("No pipeline candidates for job", JOB_ID);
    process.exit(1);
  }

  const { data: cands } = await admin
    .from("candidates")
    .select("id, name, full_name, email, phone, processing_status, cv_url")
    .in("id", ids);

  const anuja = (cands ?? []).find((c) => {
    const url = (c.cv_url ?? "").toLowerCase();
    const name = `${c.name ?? ""} ${c.full_name ?? ""}`.toLowerCase();
    return url.includes("anuja") || name.includes("anuja");
  });

  if (!anuja) {
    console.error("Anuja not found on job pipeline. Candidates:");
    for (const c of cands ?? []) {
      console.log(c.id, c.name, c.processing_status, c.cv_url?.slice(-80));
    }
    process.exit(1);
  }

  const { data: job } = await admin
    .from("jobs")
    .select("organisation_id")
    .eq("id", JOB_ID)
    .single();
  const clientOrgId = job?.organisation_id as string | undefined;
  const { data: agencyLink } = await admin
    .from("agency_clients")
    .select("agency_organisation_id")
    .eq("client_organisation_id", clientOrgId ?? "")
    .limit(1)
    .maybeSingle();
  const agencyOrgId = agencyLink?.agency_organisation_id as string | undefined;
  if (!agencyOrgId) {
    console.error("Could not resolve agency org for job", JOB_ID);
    process.exit(1);
  }

  console.log("\nBefore reprocess:", JSON.stringify(anuja, null, 2));
  console.log("Agency org:", agencyOrgId);

  const result = await reprocessAgencyCandidate(admin, {
    candidateId: anuja.id,
    agencyOrganisationId: agencyOrgId,
    markProcessing: true,
  });

  console.log("\nReprocess result:", JSON.stringify(result, null, 2));

  const { data: after } = await admin
    .from("candidates")
    .select("id, name, email, phone, processing_status, cv_raw_text")
    .eq("id", anuja.id)
    .single();

  const { data: score } = await admin
    .from("fit_scores")
    .select("overall_score, shadow_score, ideal_match_pct, market_percentile, scoring_status")
    .eq("job_id", JOB_ID)
    .eq("candidate_id", anuja.id)
    .eq("is_test_run", false)
    .is("superseded_at", null)
    .maybeSingle();

  console.log("\nAfter candidate:", after);
  console.log("\nFit score:", score);

  if (!result.success || !score?.overall_score) {
    process.exit(1);
  }
  console.log("\nOK — Anuja has FitScore", score.overall_score);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

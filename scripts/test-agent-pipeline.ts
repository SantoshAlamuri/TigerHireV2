/**
 * End-to-end test of the 5 recruitment agents running in sequence.
 *
 * Fetches a real job + candidate from the DB, then runs:
 *   1. JD Intelligence  → generates skills rubric
 *   2. Candidate Authenticity Check → scans CV for authenticity signals (agent type: ghostbuster)
 *   3. Screening        → scores candidate against job
 *   4. Communication    → generates outreach email (dry run, no send)
 *   5. Outcome Signal   → records a mock rejection outcome
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/test-agent-pipeline.ts
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 */

import * as dotenv from "dotenv";
import * as path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { runJdIntelligence } from "@/lib/agents/jd-intelligence";
import { runGhostbuster } from "@/lib/agents/ghostbuster-authenticity";
import { runScreening } from "@/lib/agents/screening";
import { runCommunication } from "@/lib/agents/communication";
import { runOutcomeSignalWriter } from "@/lib/agents/outcome-signal";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function divider(label: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${"=".repeat(60)}\n`);
}

function logJson(label: string, data: unknown) {
  console.log(`${label}:`);
  console.log(JSON.stringify(data, null, 2));
  console.log();
}

async function fetchTestIds(): Promise<{
  jobId: string;
  candidateId: string;
  organisationId: string;
  jobTitle: string;
  candidateName: string;
}> {
  const supabase = createSupabaseAdmin();

  // Find a job with title + description
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, title, organisation_id")
    .not("title", "is", null)
    .not("description", "is", null)
    .limit(1)
    .single();

  if (jobErr || !job) {
    throw new Error(`No suitable job found: ${jobErr?.message ?? "empty result"}`);
  }

  // Find a candidate with CV text
  const { data: candidate, error: candErr } = await supabase
    .from("candidates")
    .select("id, name, full_name")
    .not("cv_raw_text", "is", null)
    .limit(1)
    .single();

  if (candErr || !candidate) {
    throw new Error(`No suitable candidate found: ${candErr?.message ?? "empty result"}`);
  }

  return {
    jobId: job.id,
    candidateId: candidate.id,
    organisationId: job.organisation_id,
    jobTitle: job.title,
    candidateName: candidate.full_name ?? candidate.name ?? "Unknown",
  };
}

/* ------------------------------------------------------------------ */
/*  Pipeline                                                           */
/* ------------------------------------------------------------------ */

async function main() {
  console.log("Fetching test IDs from database...\n");

  const ids = await fetchTestIds();
  console.log(`Job:        ${ids.jobTitle} (${ids.jobId})`);
  console.log(`Candidate:  ${ids.candidateName} (${ids.candidateId})`);
  console.log(`Org:        ${ids.organisationId}`);

  // ── 1. JD Intelligence ──────────────────────────────────────────
  divider("1/5  JD Intelligence Agent");
  const jdResult = await runJdIntelligence(ids.jobId);
  logJson("Must-haves", jdResult.rubric.mustHaves);
  logJson("Nice-to-haves", jdResult.rubric.niceToHaves);
  logJson("Scoring criteria", jdResult.rubric.scoringCriteria);
  console.log(`Ideal profile: ${jdResult.rubric.idealCandidateProfile}`);
  console.log(`Red flags: ${jdResult.rubric.redFlagIndicators.join(", ")}`);
  console.log(`Sections updated: ${jdResult.sectionsUpdated}`);

  // ── 2. Candidate Authenticity Check ──────────────────────────────
  divider("2/5  Candidate Authenticity Check");
  const ghostbusterResult = await runGhostbuster(ids.candidateId);
  console.log(`Risk score: ${ghostbusterResult.riskScore}/100`);
  console.log(`Summary: ${ghostbusterResult.summary}`);
  logJson("Flags", ghostbusterResult.flags);

  // ── 3. Screening Agent ──────────────────────────────────────────
  divider("3/5  Screening Agent");
  const screenResult = await runScreening(ids.candidateId, ids.jobId, {
    forceRescore: true,
  });
  console.log(`Overall score: ${screenResult.overallScore}/100`);
  console.log(`Band: ${screenResult.band}`);
  console.log(`Already existed: ${screenResult.alreadyExisted}`);
  logJson("Green flags", screenResult.greenFlags);
  logJson("Red flags", screenResult.redFlags);
  logJson("Amber flags", screenResult.amberFlags);
  logJson("Interview angles", screenResult.interviewAngles);
  console.log(`Summary: ${screenResult.summary}`);

  // ── 4. Communication Agent ──────────────────────────────────────
  divider("4/5  Communication Agent (dry run)");
  const commsResult = await runCommunication({
    candidateId: ids.candidateId,
    messageType: "outreach",
    jobId: ids.jobId,
    dryRun: true,
  });
  console.log(`Email sent: ${commsResult.emailSent}`);
  console.log(`Subject: ${commsResult.subject}`);
  console.log(`Preview: ${commsResult.preview}`);

  // ── 5. Outcome Signal Writer ────────────────────────────────────
  divider("5/5  Outcome Signal Writer");
  const outcomeResult = await runOutcomeSignalWriter({
    candidateId: ids.candidateId,
    jobId: ids.jobId,
    organisationId: ids.organisationId,
    outcome: {
      wasHired: false,
      candidateAccepted: false,
      daysToHire: undefined,
      wasScheduled: true,
      assignmentSubmitted: false,
    },
  });
  console.log(`Outcome ID: ${outcomeResult.outcomeId}`);
  console.log(`Learning index refreshed: ${outcomeResult.learningIndexRefreshed}`);

  // ── Done ────────────────────────────────────────────────────────
  divider("Pipeline complete");
  console.log("All 5 agents ran successfully.");
  console.log("No real emails were sent (Communication ran in dry-run mode).");
}

main().catch((err) => {
  console.error("\nPipeline failed:", err);
  process.exit(1);
});

/**
 * Calibrate QA Engineer JD Base to match live job post (2–4 yr manual/API-first),
 * re-approve, then force-rescore the 8 recruiter-validation candidates.
 *
 * Usage: npx tsx scripts/calibrate-qa-jd-base-and-rescore.ts
 */

import dotenv from "dotenv";
import path from "path";
import { spawnSync } from "node:child_process";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const JOB_ID = "861e8c58-9c72-4c46-8534-a02207a35cbc";
const APPROVER_ID = "78e5b7cb-980e-485d-b452-31640a62cac8";

const VALIDATION_CANDIDATES: { id: string; label: string; recruiter: number }[] = [
  { id: "134a9416-952a-46e6-b265-245f33da3401", label: "Preethi", recruiter: 70 },
  { id: "e51881a3-461b-42c4-afcf-455101cf46c5", label: "Dhanush", recruiter: 70 },
  { id: "3ffb4e92-2467-4cee-ab5c-605032cedb48", label: "Subramanian", recruiter: 80 },
  { id: "30a7e854-53d4-43ed-b5e0-9c4e1817061e", label: "Arulmani", recruiter: 60 },
  { id: "d5c8a827-2418-411a-94fc-41501708dfef", label: "Prashanth", recruiter: 50 },
  { id: "47478384-9508-4a4d-9dda-63065a653398", label: "Vilas", recruiter: 75 },
  { id: "ea3b7abd-5504-4e00-abb5-6a8df5d2c73f", label: "Niranjan", recruiter: 30 },
  { id: "2d6a94ef-4a45-48ce-92b2-fe2ac77895cf", label: "Pratibha", recruiter: 60 },
];

/** Weights aligned to essential requirements only (automation/CI/perf are minor). */
const CALIBRATED_WEIGHTS = {
  test_strategy: 30,
  api_testing: 25,
  tools: 22,
  years_exp: 10,
  test_automation: 5,
  programming: 3,
  cicd_integration: 2,
  performance_testing: 3,
};

/** Essential requirements from the approved job post (verbatim intent). */
const ESSENTIAL_MUST_HAVES = [
  "2-4 years of hands-on QA experience in a software product environment",
  "Strong understanding of SDLC, STLC, test case design techniques, and defect lifecycle management",
  "Hands-on experience in API testing (REST/SOAP) using tools such as Postman",
  "Working knowledge of SQL for database validation and query-level troubleshooting",
  "Experience with defect tracking tools such as Jira, Azure DevOps, or equivalent",
  "Excellent attention to detail, analytical thinking, and clear written communication",
  "Ability to work independently, take ownership, and collaborate across cross-functional teams",
];

const CALIBRATED_IDEAL = {
  summary:
    "QA Engineer in a software product environment (typically 2–4 years): demonstrates SDLC/STLC literacy, strong test case design and defect lifecycle discipline, hands-on API testing (REST/SOAP) with Postman-class tools, SQL for database validation, Jira/Azure DevOps (or equivalent), and clear communication with ownership and cross-functional collaboration.",
  years_range: "2-4 years",
  must_haves: ESSENTIAL_MUST_HAVES,
  nice_to_haves: [
    "Exposure to test automation frameworks (Selenium, Playwright, or similar) — preferred, not required",
    "Familiarity with CI/CD pipeline concepts",
    "Experience with logs/monitoring platforms (e.g. Datadog) for triage",
    "Exploratory, regression, integration, and release/smoke validation experience",
  ],
  benchmarks: {
    test_strategy:
      "Evidence of SDLC/STLC, structured test case design, defect lifecycle (log, triage, retest), attention to detail, and clear written communication in defect reports",
    api_testing:
      "Hands-on REST/SOAP API testing with Postman or equivalent; validates workflows, payloads, and errors",
    tools:
      "SQL for DB validation and query troubleshooting; Jira, Azure DevOps, or equivalent defect tracking",
    years_exp:
      "2–4 years hands-on QA in a product/software environment; appropriate depth for role level",
    test_automation:
      "Optional bonus only — absence must not reduce fit below moderate if essentials are met",
    programming: "Not a primary requirement for this role",
    cicd_integration: "Optional bonus only",
    performance_testing: "Optional bonus only",
  },
};

const CALIBRATED_CONTEXT =
  "Technology & Engineering. QA Engineer (essential bar: 2–4 years product QA). Score against SDLC/STLC, test design, defect lifecycle, API/Postman, SQL, Jira/Azure DevOps, communication, and ownership/collaboration — not senior automation.";

const SCORING_STRICTNESS = `
SCORING CALIBRATION (mandatory — match how recruiters rate this 2–4 year QA role):
- Dimension scores are 1–10. Use the FULL range. Default to 5–6 when evidence is implied but not explicit.
- 7 = clearly meets this dimension for a mid-level QA hire. 8 = strong with multiple concrete examples in the CV.
- 9–10 = exceptional, rare; only if the CV cites repeated, specific outcomes for this dimension.
- Do NOT give 8+ on api_testing, tools, or test_strategy unless the CV explicitly names tools/work (Postman, SQL, Jira, test cases, defects).
- ideal_match_pct = percent of the 7 essentials clearly evidenced (0–100). Each missing essential must appear in ideal_gaps.
- Target overall fit profile: most viable candidates 55–72; strong hire 72–80; 82+ only when all 7 essentials are explicit with depth.
- Limit green_flags to at most 3, only for direct evidence. Add red_flags (moderate) for each missing essential.
- Ignore automation/CI/perf unless scoring optional dimensions; never boost overall score for automation alone.
`;

const CALIBRATED_EXTRACTION = `[tigerhire.template_id=india-008-essentials-v3-strict]
Score ONLY against these essentials (must-haves):
${ESSENTIAL_MUST_HAVES.map((m) => `- ${m}`).join("\n")}
${SCORING_STRICTNESS}
Do NOT penalize for missing Selenium, Playwright, Cypress, CI/CD, or 5+ years.
Automation and performance testing are optional positives, never critical red flags for this role.`;

/** Slightly stricter bands so "Strong Fit" label isn't inflated (overall score unchanged). */
const CALIBRATED_FIT_THRESHOLDS = {
  strong: 82,
  good: 68,
  moderate: 52,
  weak: 35,
};

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
  const { updateJdBaseDocument, approveJdBase, getJdBaseByJobId } =
    await import("@/lib/fitscore/hybrid/jd-base");
  const { FitScoreService, numericOverallFromFitScoreServiceResult } =
    await import("@/lib/services/FitScoreService");

  const admin = createSupabaseAdmin();

  console.log("\n=== 1) Update JD Base (calibrated to job post) ===\n");
  await updateJdBaseDocument(admin, JOB_ID, {
    context: CALIBRATED_CONTEXT,
    weights: CALIBRATED_WEIGHTS,
    scoreFloor: 10,
    fitThresholds: CALIBRATED_FIT_THRESHOLDS,
    extractionAdditions: CALIBRATED_EXTRACTION,
    idealCandidateProfile: CALIBRATED_IDEAL,
  });

  await approveJdBase(admin, JOB_ID, APPROVER_ID);
  const jd = await getJdBaseByJobId(admin, JOB_ID);
  console.log(
    "Approved:",
    Boolean(jd?.approvedBy),
    "| weights sum:",
    Object.values(jd!.weights).reduce((a, b) => a + b, 0),
  );
  console.log("Years range:", jd?.idealCandidateProfile?.years_range);

  console.log("\n=== 2) Force-rescore 8 validation candidates ===\n");
  const rows: Array<{
    label: string;
    recruiter: number;
    score: number | null;
    error?: string;
  }> = [];

  for (const c of VALIDATION_CANDIDATES) {
    process.stdout.write(`${c.label}... `);
    try {
      const result = await FitScoreService.computeSingle(admin, JOB_ID, c.id, {
        source: "script",
        force: true,
        saveToDb: true,
        onUnapprovedJdBase: "throw",
      });
      const score = numericOverallFromFitScoreServiceResult(result);
      rows.push({ label: c.label, recruiter: c.recruiter, score });
      console.log(score ?? "—");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      rows.push({ label: c.label, recruiter: c.recruiter, score: null, error: msg });
      console.log(`FAILED: ${msg}`);
    }
  }

  const prevScores: Record<string, number> = {
    Preethi: 94,
    Dhanush: 81,
    Subramanian: 95,
    Arulmani: 94,
    Prashanth: 83,
    Vilas: 86,
    Niranjan: 70,
    Pratibha: 84,
  };

  console.log("\n=== Results (Recruiter vs essentials v2 vs strict v3) ===\n");
  console.log("| Candidate | Recruiter | v2 | v3 strict | Δ recruiter |");
  console.log("|-----------|-----------|-----|-----------|-------------|");
  for (const r of rows) {
    const v2 = prevScores[r.label] ?? "—";
    const delta = r.score != null ? r.score - r.recruiter : null;
    const deltaStr = delta != null ? (delta >= 0 ? `+${delta}` : `${delta}`) : "—";
    console.log(
      `| ${r.label} | ${r.recruiter} | ${v2} | ${r.score ?? r.error ?? "—"} | ${deltaStr} |`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

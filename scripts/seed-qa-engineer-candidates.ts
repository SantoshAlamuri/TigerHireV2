/**
 * Seed QA Engineer job with realistic demo candidates (insert-only, pre-computed trust-risk).
 *
 * Future: `--use-real-agent` could invoke ghostbuster-authenticity per candidate (not implemented).
 *
 * Usage:
 *   npx tsx scripts/seed-qa-engineer-candidates.ts --org <uuid> --job-title "QA Engineer"
 *   npx tsx scripts/seed-qa-engineer-candidates.ts --org <uuid> --count 50 --dry-run
 *
 * Requires .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import dotenv from "dotenv";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SEED_SOURCE = "seed-script-qa-engineer";
const EMAIL_DOMAIN = "seed-qa.tigerhire.demo";

type ParsedArgs = {
  orgId: string;
  jobTitle: string;
  count: number;
  dryRun: boolean;
};

type StageBucket = {
  label: string;
  count: number;
  applicationStatus: string;
  pipelineStatus: string;
  stageMatchers: string[];
};

const STAGE_BUCKETS: StageBucket[] = [
  {
    label: "applied",
    count: 18,
    applicationStatus: "applied",
    pipelineStatus: "active",
    stageMatchers: ["applied", "new", "inbound"],
  },
  {
    label: "screening",
    count: 12,
    applicationStatus: "viewed",
    pipelineStatus: "active",
    stageMatchers: ["screen", "phone", "whatsapp"],
  },
  {
    label: "interview",
    count: 10,
    applicationStatus: "shortlisted",
    pipelineStatus: "active",
    stageMatchers: ["interview", "technical", "onsite"],
  },
  {
    label: "offer",
    count: 4,
    applicationStatus: "shortlisted",
    pipelineStatus: "active",
    stageMatchers: ["offer"],
  },
  {
    label: "hired",
    count: 3,
    applicationStatus: "hired",
    pipelineStatus: "hired",
    stageMatchers: ["hired", "joined"],
  },
  {
    label: "rejected",
    count: 3,
    applicationStatus: "rejected",
    pipelineStatus: "rejected",
    stageMatchers: ["reject", "declined"],
  },
];

const QA_TOOLS = [
  "Selenium",
  "Playwright",
  "Cypress",
  "JMeter",
  "Postman",
  "TestNG",
  "Jira",
  "API testing",
] as const;

const QA_COMPANIES = [
  "Razorpay",
  "Freshworks",
  "Zoho",
  "Flipkart",
  "PhonePe",
  "Swiggy",
  "Meesho",
  "Cred",
] as const;

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function parseArgs(argv: string[]): ParsedArgs {
  let orgId: string | null = null;
  let jobTitle = "QA Engineer";
  let count = 50;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--org") orgId = argv[++i] ?? null;
    else if (argv[i] === "--job-title") jobTitle = argv[++i] ?? jobTitle;
    else if (argv[i] === "--count") count = Number(argv[++i]);
    else if (argv[i] === "--dry-run") dryRun = true;
  }

  if (!orgId) {
    console.error(
      'Usage: npx tsx scripts/seed-qa-engineer-candidates.ts --org <uuid> [--job-title "QA Engineer"] [--count 50] [--dry-run]',
    );
    process.exit(1);
  }
  if (!Number.isFinite(count) || count < 1) {
    throw new Error("--count must be a positive number");
  }

  return { orgId, jobTitle, count, dryRun };
}

function scoreForIndex(index: number): number {
  if (index % 4 === 0) return 38 + (index % 12);
  if (index % 4 === 1) return 58 + (index % 12);
  if (index % 4 === 2) return 72 + (index % 15);
  return 81 + (index % 12);
}

function confidenceForScore(score: number): "high" | "medium" | "low" {
  if (score >= 75) return "high";
  if (score >= 55) return "medium";
  return "low";
}

const SEED_DIMENSION_KEYS = [
  "test_automation",
  "api_testing",
  "defect_management",
  "ci_cd_quality",
  "domain_knowledge",
  "communication",
  "ownership",
  "documentation",
] as const;

function bandLabelFromScore(score: number): string {
  if (score >= 78) return "Strong Fit";
  if (score >= 60) return "Good Fit";
  if (score >= 40) return "Moderate Fit";
  if (score >= 25) return "Weak Fit";
  return "Not a Fit";
}

/** Match `saveHybridFitScore` column set (hybrid v2 persist). */
function buildSeedFitScoreRow(params: {
  score: number;
  index: number;
  candidateName: string;
  resume: string;
  jobId: string;
  candidateId: string;
}): Record<string, unknown> {
  const { score, index, candidateName, resume, jobId, candidateId } = params;
  const idealMatchPct = Math.min(98, Math.max(12, score + (index % 7) - 3));
  const shadowScore = Math.min(100, Math.max(0, score + (index % 5) - 2));
  const dimensionScores: Record<string, number> = {};
  const dimensions: Record<string, { value: number; weight: number; contribution: number }> = {};
  const weightEach = 12.5;
  let rawDimScore = 0;

  for (const key of SEED_DIMENSION_KEYS) {
    const value = Math.min(10, Math.max(1, Math.round(score / 12 + (index % 4))));
    dimensionScores[key] = value;
    const contribution = (value / 10) * weightEach;
    rawDimScore += contribution;
    dimensions[key] = { value, weight: weightEach, contribution };
  }

  const idealGaps =
    score >= 75 ? [] : ["Limited performance-test depth", "No mobile automation cited"];
  const extraction = {
    candidate_name: candidateName,
    total_years: 2 + (index % 8),
    dimension_scores: dimensionScores,
    certifications: index % 3 === 0 ? ["ISTQB Foundation Level"] : [],
    quantified_impact: ["Cut regression suite runtime ~30% via automation on seed profile"],
    red_flags:
      score < 55
        ? [{ flag: "Thin automation evidence for senior bar", severity: "moderate" as const }]
        : [],
    green_flags: score >= 72 ? ["Solid API + UI test automation", "Clear release ownership"] : [],
    role_match_tag: "qa_engineer",
    summary: `${candidateName} — QA engineer seed profile with ${2 + (index % 8)}+ years in quality.`,
    ideal_match_pct: idealMatchPct,
    ideal_gaps: idealGaps,
  };

  const resumeLines = resume.split("\n").filter(Boolean);
  const evidence_json = {
    quotes: [
      {
        dimension: SEED_DIMENSION_KEYS[0],
        quote: resumeLines[2] ?? "Test automation across web and API products",
        location_hint: "Skills",
      },
      {
        dimension: SEED_DIMENSION_KEYS[1],
        quote: resumeLines[3] ?? "Experience building regression suites and release gates",
        location_hint: "Experience",
      },
    ],
  };

  const band = bandLabelFromScore(score);
  const oneLine = `${band} for QA Engineer requirements.`;

  return {
    job_id: jobId,
    candidate_id: candidateId,
    overall_score: score,
    band,
    scoring_version: 2,
    v2_extraction: extraction,
    v2_score_breakdown: {
      rawDimScore,
      certBonus: index % 4 === 0 ? 2 : 0,
      impactBonus: 1,
      greenBonus: score >= 70 ? 2 : 0,
      redPenalty: score < 55 ? 5 : 0,
      redPenaltyUncapped: score < 55 ? 5 : 0,
      dimensions,
      formulaLines: [`Seed weighted dimensions ≈ ${Math.round(rawDimScore)}`],
      confidence_score: score >= 75 ? 0.85 : score >= 55 ? 0.65 : 0.45,
    },
    v2_explanation: oneLine,
    evidence_json,
    summary: oneLine,
    one_line_summary: oneLine,
    green_flags: extraction.green_flags,
    red_flags: extraction.red_flags.map((r: { flag: string }) => r.flag),
    confidence: confidenceForScore(score),
    ideal_match_pct: idealMatchPct,
    ideal_gaps: idealGaps,
    shadow_score: shadowScore,
    verdict: score >= 75 ? "Strong fit" : score >= 55 ? "Borderline fit" : "Pass for now",
    scoring_status: "scored",
    is_test_run: false,
    run_index: 1,
  };
}

function trustProfileForIndex(index: number): {
  authenticity_score: number;
  authenticity_signal: string;
  authenticity_flags: Array<{ type: string; severity: string; evidence: string }>;
  ghost_risk_score: number;
} {
  const roll = index % 20;
  if (roll === 19) {
    return {
      authenticity_score: 72,
      authenticity_signal: "likely_ai_generated",
      authenticity_flags: [
        { type: "timeline_gap", severity: "medium", evidence: "Overlapping employment dates" },
        {
          type: "generic_phrasing",
          severity: "high",
          evidence: "Repeated AI-style bullet patterns",
        },
      ],
      ghost_risk_score: 68,
    };
  }
  if (roll === 18 || roll === 17) {
    return {
      authenticity_score: 42,
      authenticity_signal: "review_carefully",
      authenticity_flags: [
        {
          type: "sparse_detail",
          severity: "low",
          evidence: "Thin project descriptions for tenure",
        },
      ],
      ghost_risk_score: 35,
    };
  }
  return {
    authenticity_score: 12,
    authenticity_signal: "likely_authentic",
    authenticity_flags: [],
    ghost_risk_score: 8,
  };
}

function buildResume(index: number): string {
  const years = 2 + (index % 9);
  const toolA = QA_TOOLS[index % QA_TOOLS.length];
  const toolB = QA_TOOLS[(index + 3) % QA_TOOLS.length];
  const companyA = QA_COMPANIES[index % QA_COMPANIES.length];
  const companyB = QA_COMPANIES[(index + 2) % QA_COMPANIES.length];
  return [
    `Seed QA Candidate ${String(index + 1).padStart(2, "0")}`,
    `${years}+ years in quality engineering across web and API products.`,
    `Tools: ${toolA}, ${toolB}, test automation frameworks, CI pipelines.`,
    `Experience at ${companyA} and ${companyB} building regression suites and release gates.`,
    "Led defect triage, test planning, and stakeholder reporting for sprint releases.",
  ].join("\n");
}

function pickStage(
  stages: Array<{ id: string; stage_name: string }>,
  matchers: string[],
): string | null {
  const lower = stages.map((s) => ({ ...s, name: String(s.stage_name).toLowerCase() }));
  for (const token of matchers) {
    const hit = lower.find((s) => s.name.includes(token));
    if (hit) return hit.id;
  }
  return stages[0]?.id ?? null;
}

async function deletePreviousSeed(supabase: SupabaseClient, jobId: string, dryRun: boolean) {
  const { data: appRows, error: appErr } = await supabase
    .from("applications")
    .select("candidate_id")
    .eq("job_id", jobId);
  if (appErr) throw new Error(`Failed listing job applications: ${appErr.message}`);
  const appCandidateIds = [...new Set((appRows ?? []).map((r) => r.candidate_id as string))];
  if (appCandidateIds.length === 0) return 0;

  const { data: existing, error } = await supabase
    .from("candidates")
    .select("id, email")
    .in("id", appCandidateIds)
    .ilike("email", `%@${EMAIL_DOMAIN}`);
  if (error) throw new Error(`Failed listing prior seed candidates: ${error.message}`);
  const ids = (existing ?? [])
    .filter((r) => String((r as { email?: string }).email ?? "").endsWith(`@${EMAIL_DOMAIN}`))
    .map((r) => r.id as string);
  if (ids.length === 0) return 0;
  if (dryRun) {
    console.log(`[dry-run] Would delete ${ids.length} prior seed candidates`);
    return ids.length;
  }

  await supabase.from("vouches").delete().in("candidate_id", ids);
  await supabase.from("fit_scores").delete().in("candidate_id", ids);
  await supabase.from("pipeline_candidates").delete().in("candidate_id", ids);
  await supabase.from("applications").delete().in("candidate_id", ids);
  const { error: delErr } = await supabase.from("candidates").delete().in("id", ids);
  if (delErr) throw new Error(`Failed deleting prior seed candidates: ${delErr.message}`);
  console.log(`Removed ${ids.length} prior seed candidates`);
  return ids.length;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, title, organisation_id")
    .eq("organisation_id", args.orgId)
    .ilike("title", `%${args.jobTitle}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (jobErr) throw new Error(jobErr.message);
  if (!job?.id) throw new Error(`No job matching title "${args.jobTitle}" in org ${args.orgId}`);

  const { data: stages, error: stageErr } = await supabase
    .from("pipeline_stages")
    .select("id, stage_name, stage_order")
    .eq("job_id", job.id)
    .order("stage_order", { ascending: true });
  if (stageErr) throw new Error(stageErr.message);

  await deletePreviousSeed(supabase, job.id, args.dryRun);

  const buckets = STAGE_BUCKETS.flatMap((b) => Array.from({ length: b.count }, () => b)).slice(
    0,
    args.count,
  );

  while (buckets.length < args.count) {
    buckets.push(STAGE_BUCKETS[0]);
  }

  const referrerRows = [
    { name: "Seed Referrer Alpha", whatsapp_number: "+919900000101", type: "individual" as const },
    { name: "Seed Referrer Beta", whatsapp_number: "+919900000102", type: "individual" as const },
    { name: "Seed Referrer Gamma", whatsapp_number: "+919900000103", type: "agency" as const },
  ];
  const referrerIds: string[] = [];

  if (!args.dryRun) {
    for (const row of referrerRows) {
      const { data: existing } = await supabase
        .from("referrers")
        .select("id")
        .eq("whatsapp_number", row.whatsapp_number)
        .maybeSingle();
      if (existing?.id) {
        referrerIds.push(existing.id as string);
        continue;
      }
      const { data: inserted, error } = await supabase
        .from("referrers")
        .insert({ ...row, upi_id: "seed@upi", status: "active", whatsapp_verified: true })
        .select("id")
        .single();
      if (error) throw new Error(`referrer insert: ${error.message}`);
      referrerIds.push(inserted!.id as string);
    }
  } else {
    referrerIds.push("dry-run-referrer-1", "dry-run-referrer-2", "dry-run-referrer-3");
  }

  let created = 0;
  for (let i = 0; i < args.count; i++) {
    const n = String(i + 1).padStart(2, "0");
    const email = `seed.qa.${n}@${EMAIL_DOMAIN}`;
    const phone = `+91900000${String(i + 1).padStart(4, "0")}`;
    const bucket = buckets[i]!;
    const score = scoreForIndex(i);
    const trust = trustProfileForIndex(i);
    const stageId = pickStage(stages ?? [], bucket.stageMatchers);
    const withReferral = i % 10 < 3;
    const withVouch = i % 5 === 0;

    if (args.dryRun) {
      console.log(
        `[dry-run] #${n} ${bucket.label} score=${score} referral=${withReferral} vouch=${withVouch} stage=${stageId ?? "none"}`,
      );
      created++;
      continue;
    }

    const displayName = `Seed QA Candidate ${n}`;
    const { data: candidate, error: candErr } = await supabase
      .from("candidates")
      .insert({
        name: displayName,
        full_name: displayName,
        email,
        phone,
        location: ["Bengaluru", "Pune", "Hyderabad"][i % 3],
        skills: [
          QA_TOOLS[i % QA_TOOLS.length],
          QA_TOOLS[(i + 2) % QA_TOOLS.length],
          "Manual testing",
        ],
        experience_years: 2 + (i % 8),
        cv_raw_text: buildResume(i),
        entry_path: SEED_SOURCE,
        intent_score: Math.max(50, score - 5),
        ...trust,
      })
      .select("id")
      .single();
    if (candErr) throw new Error(`candidate ${n}: ${candErr.message}`);

    const candidateId = candidate!.id as string;

    await supabase.from("applications").insert({
      candidate_id: candidateId,
      job_id: job.id,
      status: bucket.applicationStatus,
      direct_referrer_id: withReferral ? referrerIds[i % referrerIds.length] : null,
    });

    await supabase.from("pipeline_candidates").insert({
      candidate_id: candidateId,
      job_id: job.id,
      stage_id: stageId,
      status: bucket.pipelineStatus,
      unlocked: true,
    });

    await supabase.from("fit_scores").insert(
      buildSeedFitScoreRow({
        score,
        index: i,
        candidateName: displayName,
        resume: buildResume(i),
        jobId: job.id,
        candidateId,
      }),
    );

    if (withVouch) {
      const vouchCount = 1 + (i % 3);
      for (let v = 0; v < vouchCount; v++) {
        await supabase.from("vouches").insert({
          candidate_id: candidateId,
          voucher_name: `Seed Voucher ${n}-${v + 1}`,
          relationship_type: "colleague",
          standout_sentence: "Strong ownership on release quality and regression discipline.",
          strength_score: 70 + ((i + v) % 25),
        });
      }
    }

    created++;
  }

  console.log(
    JSON.stringify({
      ok: true,
      dryRun: args.dryRun,
      organisationId: args.orgId,
      jobId: job.id,
      jobTitle: job.title,
      candidates: created,
    }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

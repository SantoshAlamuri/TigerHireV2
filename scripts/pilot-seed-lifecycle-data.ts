/**
 * Seed deterministic pilot lifecycle data on the QA job for E2E (gate, Tasks, offer).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/pilot-seed-lifecycle-data.ts
 *   npm run pilot:seed
 *
 * Writes e2e/.pilot-seed-cache.json (gitignored) for act-lifecycle-serial.spec.ts.
 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ensureRecruitmentPlanForJob, linkPlanStagesToPipeline } from "../src/lib/recruitment-plan";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.pilot-e2e.local") });

const DEFAULT_PILOT_JOB_ID = "861e8c58-9c72-4c46-8534-a02207a35cbc";
const EMAIL_DOMAIN = "seed-qa.tigerhire.demo";
const GATE_EMAIL = `pilot.lifecycle.gate@${EMAIL_DOMAIN}`;
const OFFER_EMAIL = `pilot.lifecycle.offer@${EMAIL_DOMAIN}`;
const CACHE_PATH = path.resolve(process.cwd(), "e2e/.pilot-seed-cache.json");

const DEFAULT_PIPELINE_STAGES = [
  { stage_name: "Applied", stage_order: 0 },
  { stage_name: "Phone screen", stage_order: 1 },
  { stage_name: "Technical interview", stage_order: 2 },
  { stage_name: "HM round", stage_order: 3 },
  { stage_name: "Offer", stage_order: 4 },
];

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function jobId(): string {
  return process.env.PILOT_JOB_ID?.trim() || DEFAULT_PILOT_JOB_ID;
}

async function resolveProfileId(admin: SupabaseClient, email: string): Promise<string | null> {
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const authUser = users?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  return authUser?.id ?? null;
}

async function ensurePipelineStages(
  admin: SupabaseClient,
  jobIdVal: string,
): Promise<Array<{ id: string; stage_name: string; stage_order: number }>> {
  const { data: existing } = await admin
    .from("pipeline_stages")
    .select("id, stage_name, stage_order")
    .eq("job_id", jobIdVal)
    .order("stage_order", { ascending: true });

  if ((existing ?? []).length >= 3) {
    return existing as Array<{ id: string; stage_name: string; stage_order: number }>;
  }

  const { data: job } = await admin
    .from("jobs")
    .select("organisation_id")
    .eq("id", jobIdVal)
    .single();
  if (!job?.organisation_id) throw new Error("Job not found for pipeline stage seed");

  for (const row of DEFAULT_PIPELINE_STAGES) {
    await admin.from("pipeline_stages").insert({
      job_id: jobIdVal,
      stage_name: row.stage_name,
      stage_order: row.stage_order,
    });
  }

  const { data: created } = await admin
    .from("pipeline_stages")
    .select("id, stage_name, stage_order")
    .eq("job_id", jobIdVal)
    .order("stage_order", { ascending: true });

  console.log(`  ✓ Created ${DEFAULT_PIPELINE_STAGES.length} pipeline stages`);
  return (created ?? []) as Array<{ id: string; stage_name: string; stage_order: number }>;
}

async function ensurePlanWithGate(
  admin: SupabaseClient,
  job: {
    id: string;
    organisation_id: string;
    status?: string | null;
    hiring_manager_id?: string | null;
  },
  createdBy: string,
  pipelineStages: Array<{ id: string; stage_name: string; stage_order: number }>,
): Promise<{ gatedPipelineStageId: string; preGatePipelineStageId: string }> {
  const ensured = await ensureRecruitmentPlanForJob({
    jobId: job.id,
    organisationId: job.organisation_id,
    jobStatus: job.status,
    createdBy,
  });
  if (ensured.error || !ensured.plan) {
    throw ensured.error ?? new Error("Failed to ensure recruitment plan");
  }

  let stages = ensured.stages;
  const linked = await linkPlanStagesToPipeline(admin, job.id, ensured.plan.id, stages);
  stages = linked.stages;

  const gatePipelineIndex = Math.min(3, Math.max(2, pipelineStages.length - 2));
  const gatedPipelineStage = pipelineStages[gatePipelineIndex]!;
  const preGatePipelineStage = pipelineStages[Math.max(0, gatePipelineIndex - 1)]!;

  const planStageToGate =
    stages.find((s) => s.pipeline_stage_id === gatedPipelineStage.id) ??
    stages.find((s) => s.stage_order === gatePipelineIndex) ??
    stages[stages.length - 2];

  if (!planStageToGate?.id) {
    throw new Error("No plan stage to attach recruiter_and_hm gate");
  }

  await admin
    .from("plan_stages")
    .update({
      approval_gate: "recruiter_and_hm",
      pipeline_stage_id: gatedPipelineStage.id,
    })
    .eq("id", planStageToGate.id);

  console.log(
    `  ✓ Gate on plan stage "${planStageToGate.display_name}" → pipeline "${gatedPipelineStage.stage_name}"`,
  );

  return {
    gatedPipelineStageId: gatedPipelineStage.id,
    preGatePipelineStageId: preGatePipelineStage.id,
  };
}

async function approveJdBase(admin: SupabaseClient, jobIdVal: string) {
  const { data: jd } = await admin
    .from("jd_base_documents")
    .select("id, approved_at")
    .eq("job_id", jobIdVal)
    .maybeSingle();
  if (!jd?.id) {
    console.log("  · No JD Base row — open Plan in UI once if readiness fails");
    return;
  }
  if (!jd.approved_at) {
    await admin
      .from("jd_base_documents")
      .update({ approved_at: new Date().toISOString() })
      .eq("job_id", jobIdVal);
    console.log("  ✓ JD Base marked approved");
  }
}

async function deleteLifecycleSeeds(admin: SupabaseClient, jobIdVal: string) {
  const { data: candidates } = await admin
    .from("candidates")
    .select("id")
    .in("email", [GATE_EMAIL, OFFER_EMAIL]);
  const ids = (candidates ?? []).map((c) => c.id as string);
  if (ids.length === 0) return;

  const { data: pcs } = await admin
    .from("pipeline_candidates")
    .select("id")
    .eq("job_id", jobIdVal)
    .in("candidate_id", ids);
  const pcIds = (pcs ?? []).map((p) => p.id as string);
  if (pcIds.length > 0) {
    await admin.from("shortlist_approvals").delete().in("pipeline_candidate_id", pcIds);
  }

  const { data: apps } = await admin
    .from("applications")
    .select("id")
    .eq("job_id", jobIdVal)
    .in("candidate_id", ids);
  const appIds = (apps ?? []).map((a) => a.id as string);
  if (appIds.length > 0) {
    await admin.from("offers").delete().in("application_id", appIds);
  }

  await admin.from("fit_scores").delete().eq("job_id", jobIdVal).in("candidate_id", ids);
  await admin.from("pipeline_candidates").delete().eq("job_id", jobIdVal).in("candidate_id", ids);
  await admin.from("applications").delete().eq("job_id", jobIdVal).in("candidate_id", ids);
  await admin.from("candidates").delete().in("id", ids);
  console.log(`  ✓ Removed ${ids.length} prior lifecycle seed candidate(s)`);
}

async function seedGateCandidate(
  admin: SupabaseClient,
  jobIdVal: string,
  preGateStageId: string,
): Promise<{ pipelineCandidateId: string; candidateId: string }> {
  const displayName = "Pilot Lifecycle Gate";
  const { data: candidate, error: cErr } = await admin
    .from("candidates")
    .insert({
      name: displayName,
      full_name: displayName,
      email: GATE_EMAIL,
      phone: "+919000009001",
      location: "Bengaluru",
      skills: ["Playwright", "API testing", "Test automation"],
      experience_years: 5,
      cv_raw_text: `${displayName}\n5+ years QA automation.\nPlaywright, CI/CD, API testing.`,
      entry_path: "pilot-lifecycle-seed",
    })
    .select("id")
    .single();
  if (cErr) throw new Error(`gate candidate: ${cErr.message}`);

  const candidateId = candidate!.id as string;

  await admin.from("applications").insert({
    candidate_id: candidateId,
    job_id: jobIdVal,
    status: "shortlisted",
  });

  const { data: pc, error: pcErr } = await admin
    .from("pipeline_candidates")
    .insert({
      candidate_id: candidateId,
      job_id: jobIdVal,
      stage_id: preGateStageId,
      status: "shortlisted",
      unlocked: true,
    })
    .select("id")
    .single();
  if (pcErr) throw new Error(`gate pipeline_candidates: ${pcErr.message}`);

  await admin.from("fit_scores").insert({
    job_id: jobIdVal,
    candidate_id: candidateId,
    overall_score: 82,
    band: "Strong Fit",
    scoring_version: 2,
    scoring_status: "scored",
    summary: "Pilot lifecycle seed — strong fit for QA Engineer.",
    one_line_summary: "Strong fit for QA Engineer (pilot seed).",
    confidence: "high",
    verdict: "Strong fit",
  });

  console.log(`  ✓ Gate candidate ${GATE_EMAIL} (shortlisted, pre-gate stage)`);
  return { pipelineCandidateId: pc!.id as string, candidateId };
}

async function seedOfferCandidate(
  admin: SupabaseClient,
  job: { id: string; organisation_id: string },
  recruiterId: string,
  pipelineStages: Array<{ id: string; stage_name: string; stage_order: number }>,
): Promise<{ pipelineCandidateId: string; applicationId: string } | null> {
  const offerStage =
    pipelineStages.find((s) => /offer/i.test(s.stage_name)) ??
    pipelineStages[pipelineStages.length - 1];
  if (!offerStage) return null;

  const displayName = "Pilot Lifecycle Offer";
  const { data: candidate, error: cErr } = await admin
    .from("candidates")
    .insert({
      name: displayName,
      full_name: displayName,
      email: OFFER_EMAIL,
      phone: "+919000009002",
      location: "Bengaluru",
      skills: ["QA", "Automation"],
      experience_years: 6,
      cv_raw_text: `${displayName}\nOffer-stage pilot seed.`,
      entry_path: "pilot-lifecycle-seed",
    })
    .select("id")
    .single();
  if (cErr) throw new Error(`offer candidate: ${cErr.message}`);

  const candidateId = candidate!.id as string;

  const { data: app, error: appErr } = await admin
    .from("applications")
    .insert({
      candidate_id: candidateId,
      job_id: job.id,
      status: "shortlisted",
    })
    .select("id")
    .single();
  if (appErr) throw new Error(`offer application: ${appErr.message}`);

  const { data: pc, error: pcErr } = await admin
    .from("pipeline_candidates")
    .insert({
      candidate_id: candidateId,
      job_id: job.id,
      stage_id: offerStage.id,
      status: "shortlisted",
      unlocked: true,
    })
    .select("id")
    .single();
  if (pcErr) throw new Error(`offer pipeline_candidates: ${pcErr.message}`);

  await admin.from("fit_scores").insert({
    job_id: job.id,
    candidate_id: candidateId,
    overall_score: 88,
    band: "Strong Fit",
    scoring_version: 2,
    scoring_status: "scored",
    summary: "Pilot offer-stage seed.",
    confidence: "high",
    verdict: "Strong fit",
  });

  await admin.from("offers").insert({
    application_id: app!.id,
    organisation_id: job.organisation_id,
    created_by: recruiterId,
    role_title: "QA Engineer",
    start_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    status: "pending_admin",
    compensation_json: { ctc: 1800000, currency: "INR" },
    notes: "Pilot E2E — finance approval task seed",
  });

  console.log(`  ✓ Offer candidate ${OFFER_EMAIL} (offer stage + pending_admin offer)`);
  return {
    pipelineCandidateId: pc!.id as string,
    applicationId: app!.id as string,
  };
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const jobIdVal = jobId();
  console.log("Pilot lifecycle seed for job", jobIdVal);

  const { data: job, error: jobErr } = await admin
    .from("jobs")
    .select("id, title, organisation_id, status, hiring_manager_id, assigned_recruiter_id")
    .eq("id", jobIdVal)
    .maybeSingle();
  if (jobErr || !job) {
    throw new Error(jobErr?.message ?? `Job not found: ${jobIdVal}`);
  }
  console.log("  Job:", job.title);

  const recruiterId =
    (job.assigned_recruiter_id as string | null) ??
    (await resolveProfileId(admin, "rajiv.menon@finstack.in"));
  if (!recruiterId) throw new Error("No recruiter profile for plan seed");

  if (!job.hiring_manager_id) {
    const hmId = await resolveProfileId(admin, "kavita.rao@finstack.in");
    if (hmId) {
      await admin.from("jobs").update({ hiring_manager_id: hmId }).eq("id", jobIdVal);
      job.hiring_manager_id = hmId;
      console.log("  ✓ Set hiring_manager_id to Kavita Rao");
    }
  }

  await deleteLifecycleSeeds(admin, jobIdVal);
  const pipelineStages = await ensurePipelineStages(admin, jobIdVal);
  await approveJdBase(admin, jobIdVal);

  const { gatedPipelineStageId, preGatePipelineStageId } = await ensurePlanWithGate(
    admin,
    job,
    recruiterId,
    pipelineStages,
  );

  const gate = await seedGateCandidate(admin, jobIdVal, preGatePipelineStageId);
  const offer = await seedOfferCandidate(admin, job, recruiterId, pipelineStages);

  const cache = {
    jobId: jobIdVal,
    gatePipelineCandidateId: gate.pipelineCandidateId,
    gateCandidateId: gate.candidateId,
    gatedPipelineStageId,
    preGatePipelineStageId,
    offerPipelineCandidateId: offer?.pipelineCandidateId,
    offerApplicationId: offer?.applicationId,
    seededAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`);
  console.log("\nWrote", CACHE_PATH);
  console.log("\nNext:");
  console.log("  npm run test:e2e:pilot");
  console.log("  (or npm run pilot:pretest — includes seed)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

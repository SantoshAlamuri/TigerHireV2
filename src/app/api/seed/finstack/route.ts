import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { jsonError, jsonSuccess } from "@/lib/api-helpers";

/**
 * POST /api/seed/finstack
 * Seeds Finstack org with jobs, candidates, applications, fit_scores, and pipeline data
 * for testing the platform. Run after seed-demo-users.
 * Allowed only in development or when X-Seed-Demo-Secret header matches SEED_DEMO_SECRET.
 */
const SEED_JOB_TITLE_PREFIX = "[Seed] ";

function buildFinanceManagerSeedJob(
  orgId: string,
  createdBy: string | null,
  hiringManagerId: string | null,
) {
  return {
    organisation_id: orgId,
    created_by: createdBy,
    hiring_manager_id: hiringManagerId,
    title: `${SEED_JOB_TITLE_PREFIX}Finance Manager`,
    description:
      "Lead finance operations, FP&A, reporting, and compliance for a fast-growing fintech. CA/MBA preferred; 8+ years including team leadership.",
    location: "Bangalore (Hybrid)",
    status: "open" as const,
    compensation_min: 20,
    compensation_max: 45,
    skills_required: ["FP&A", "IFRS", "Audit", "Team leadership", "Stakeholder management"],
    role_function: "Finance",
  };
}

/** Referral demo: direct + org-verified employee ₹15k; parent (child chain) ₹8k — offer_accepted. */
function financeManagerReferralConfig(jobId: string) {
  return {
    job_id: jobId,
    direct_bonus_amount: 15000,
    employee_bonus_amount: 15000,
    parent_bonus_amount: 8000,
    bonus_trigger: "offer_accepted" as const,
    bonus_currency: "INR",
    bonus_notes:
      "Seed: employee (org-verified direct) ₹15,000; parent/second-level ₹8,000 — offer_accepted trigger.",
    updated_at: new Date().toISOString(),
  };
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return jsonError("Not available", 404);
  }
  const secret = request.headers.get("x-seed-demo-secret");
  const allowed =
    process.env.NODE_ENV === "development" ||
    (process.env.SEED_DEMO_SECRET && secret === process.env.SEED_DEMO_SECRET);
  if (!allowed) {
    return jsonError("Not allowed", 403);
  }

  const admin = createSupabaseAdmin();

  try {
    const { data: orgRows } = await admin
      .from("organisations")
      .select("id")
      .eq("name", "Finstack")
      .limit(1);
    const orgId = orgRows?.[0]?.id;
    if (!orgId) {
      return jsonError(
        "Finstack organisation not found. Run POST /api/auth/seed-demo-users first.",
        400,
      );
    }

    // Idempotent: full seed runs once when no [Seed] jobs exist. If Finstack was seeded before
    // Finance Manager existed, we add that job + referral_config only (incremental).
    const { data: existingSeedJobs } = await admin
      .from("jobs")
      .select("id")
      .eq("organisation_id", orgId)
      .like("title", `${SEED_JOB_TITLE_PREFIX}%`)
      .limit(1);

    if (existingSeedJobs?.length) {
      const fmTitle = `${SEED_JOB_TITLE_PREFIX}Finance Manager`;
      const { data: fmExisting } = await admin
        .from("jobs")
        .select("id")
        .eq("organisation_id", orgId)
        .eq("title", fmTitle)
        .maybeSingle();
      if (fmExisting?.id) {
        return jsonSuccess({
          message:
            "Finstack already has seed data. Use the demo candidate logins (priya.sharma@gmail.com / siddharth.patil@outlook.com) to test applications and match feed.",
          alreadySeeded: true,
        });
      }

      const { data: usersInc } = await admin.auth.admin.listUsers({ perPage: 500 });
      const byEmailInc = new Map((usersInc?.users ?? []).map((u) => [u.email?.toLowerCase(), u]));
      const kavitaInc = byEmailInc.get("kavita.rao@finstack.in");
      const rajivInc = byEmailInc.get("rajiv.menon@finstack.in");
      const hiringManagerIdInc = kavitaInc?.id ?? null;
      const createdByInc = rajivInc?.id ?? kavitaInc?.id ?? null;

      const { data: insertedFm, error: fmErr } = await admin
        .from("jobs")
        .insert(buildFinanceManagerSeedJob(orgId, createdByInc, hiringManagerIdInc))
        .select("id")
        .single();
      if (fmErr || !insertedFm?.id) {
        return jsonError(
          `Failed to insert Finance Manager seed job: ${fmErr?.message ?? "unknown"}`,
          500,
        );
      }
      const { error: cfgErr } = await admin
        .from("job_referral_config")
        .upsert(financeManagerReferralConfig(insertedFm.id), { onConflict: "job_id" });
      if (cfgErr) {
        return jsonError(`Failed to upsert job_referral_config: ${cfgErr.message}`, 500);
      }
      return jsonSuccess({
        message:
          "Added [Seed] Finance Manager with referral bonuses (employee ₹15k, parent ₹8k). Re-run full seed is not required.",
        incrementalFinanceManager: true,
        financeManagerJobId: insertedFm.id,
      });
    }

    const { data: users } = await admin.auth.admin.listUsers({ perPage: 500 });
    const byEmail = new Map((users?.users ?? []).map((u) => [u.email?.toLowerCase(), u]));
    const kavita = byEmail.get("kavita.rao@finstack.in");
    const rajiv = byEmail.get("rajiv.menon@finstack.in");
    const priya = byEmail.get("priya.sharma@gmail.com");
    const siddharth = byEmail.get("siddharth.patil@outlook.com");

    const hiringManagerId = kavita?.id ?? null;
    const createdBy = rajiv?.id ?? kavita?.id ?? null;

    // 1) Jobs for Finstack
    const jobsSeed: Record<string, unknown>[] = [
      {
        organisation_id: orgId,
        created_by: createdBy,
        hiring_manager_id: hiringManagerId,
        title: `${SEED_JOB_TITLE_PREFIX}Senior Full Stack Engineer`,
        description:
          "Build and own product features end-to-end. 4+ years React/Node, strong system design. Finstack is building the future of financial workflows.",
        location: "Bangalore (Hybrid)",
        status: "open" as const,
        compensation_min: 18,
        compensation_max: 32,
        skills_required: ["React", "Node.js", "TypeScript", "PostgreSQL"],
      },
      {
        organisation_id: orgId,
        created_by: createdBy,
        hiring_manager_id: hiringManagerId,
        title: `${SEED_JOB_TITLE_PREFIX}Product Manager`,
        description:
          "Own roadmap and execution for our B2B payments product. 3+ years PM experience, fintech or SaaS background preferred.",
        location: "Mumbai (Remote)",
        status: "open" as const,
        compensation_min: 22,
        compensation_max: 38,
        skills_required: ["Product strategy", "Stakeholder management", "Analytics"],
      },
      {
        organisation_id: orgId,
        created_by: createdBy,
        hiring_manager_id: null,
        title: `${SEED_JOB_TITLE_PREFIX}DevOps Engineer`,
        description:
          "Own CI/CD, observability, and cloud infra. Terraform, Kubernetes, AWS/GCP. Help us scale reliably.",
        location: "Remote",
        status: "open" as const,
        compensation_min: 16,
        compensation_max: 28,
        skills_required: ["Kubernetes", "Terraform", "AWS", "CI/CD"],
      },
      {
        organisation_id: orgId,
        created_by: createdBy,
        hiring_manager_id: hiringManagerId,
        title: `${SEED_JOB_TITLE_PREFIX}Data Analyst`,
        description:
          "Turn product and usage data into insights. SQL, Python, dashboards. Work with eng and product teams.",
        location: "Bangalore",
        status: "closed" as const,
        compensation_min: 10,
        compensation_max: 18,
        skills_required: ["SQL", "Python", "Data visualization", "Statistics"],
      },
      buildFinanceManagerSeedJob(orgId, createdBy, hiringManagerId),
    ];

    const jobIds: string[] = [];
    for (const j of jobsSeed) {
      const { data: inserted } = await admin.from("jobs").insert(j).select("id").single();
      if (inserted?.id) jobIds.push(inserted.id);
    }

    if (jobIds.length === 0) {
      return jsonError("Failed to create jobs", 500);
    }

    const job1Id = jobIds[0];
    const job2Id = jobIds[1];
    const job3Id = jobIds[2];
    const job4Id = jobIds[3];
    const financeManagerJobId = jobIds[4];

    if (financeManagerJobId) {
      const { error: refCfgErr } = await admin
        .from("job_referral_config")
        .upsert(financeManagerReferralConfig(financeManagerJobId), { onConflict: "job_id" });
      if (refCfgErr) {
        return jsonError(
          `Failed to upsert Finance Manager referral config: ${refCfgErr.message}`,
          500,
        );
      }
    }

    // 2) Candidates (mix of linked and unlinked)
    const candidatesSeed: Record<string, unknown>[] = [
      {
        user_id: priya?.id ?? null,
        name: "Priya Sharma",
        email: "priya.sharma@gmail.com",
        phone: "+919876543210",
        skills: ["React", "TypeScript", "Node.js", "System design"],
        experience_years: 5,
        location: "Bangalore",
        intent_score: 85,
      },
      {
        user_id: siddharth?.id ?? null,
        name: "Siddharth Patil",
        email: "siddharth.patil@outlook.com",
        phone: "+919876543211",
        skills: ["Python", "SQL", "Data pipelines", "ML basics"],
        experience_years: 3,
        location: "Pune",
        intent_score: 70,
      },
      {
        user_id: null,
        name: "Arjun Krishnan",
        email: "arjun.k@example.com",
        phone: "+919876543212",
        skills: ["React", "Node.js", "PostgreSQL", "AWS"],
        experience_years: 6,
        location: "Chennai",
        intent_score: 90,
      },
      {
        user_id: null,
        name: "Neha Desai",
        email: "neha.desai@example.com",
        phone: null,
        skills: ["Product management", "Roadmapping", "Stakeholder management"],
        experience_years: 4,
        location: "Mumbai",
        intent_score: 78,
      },
      {
        user_id: null,
        name: "Vikram Singh",
        email: "vikram.s@example.com",
        phone: "+919876543214",
        skills: ["Kubernetes", "Terraform", "AWS", "Go"],
        experience_years: 5,
        location: "Hyderabad",
        intent_score: 82,
      },
      {
        user_id: null,
        name: "Anita Iyer",
        email: "anita.iyer@example.com",
        phone: null,
        skills: ["SQL", "Python", "Tableau", "A/B testing"],
        experience_years: 3,
        location: "Bangalore",
        intent_score: 75,
      },
    ];

    const candidateIds: string[] = [];
    for (const c of candidatesSeed) {
      const { data: inserted } = await admin.from("candidates").insert(c).select("id").single();
      if (inserted?.id) candidateIds.push(inserted.id);
    }

    if (candidateIds.length < 4) {
      return jsonError("Failed to create enough candidates", 500);
    }

    const [c1, c2, c3, c4, c5, c6] = candidateIds;

    // 3) Applications: spread across jobs
    const applicationsSeed: {
      candidate_id: string;
      job_id: string;
      status: string;
    }[] = [
      { candidate_id: c1, job_id: job1Id, status: "shortlisted" },
      { candidate_id: c3, job_id: job1Id, status: "applied" },
      { candidate_id: c5, job_id: job1Id, status: "viewed" },
      { candidate_id: c2, job_id: job2Id, status: "applied" },
      { candidate_id: c4, job_id: job2Id, status: "shortlisted" },
      { candidate_id: c1, job_id: job2Id, status: "applied" },
      { candidate_id: c5, job_id: job3Id, status: "shortlisted" },
      ...(job4Id ? [{ candidate_id: c6, job_id: job4Id, status: "viewed" as const }] : []),
    ];

    const appIds: {
      applicationId: string;
      jobId: string;
      candidateId: string;
    }[] = [];
    for (const a of applicationsSeed) {
      if (!a.job_id) continue;
      const { data: inserted } = await admin
        .from("applications")
        .insert({
          candidate_id: a.candidate_id,
          job_id: a.job_id,
          status: a.status,
        })
        .select("id, job_id, candidate_id")
        .single();
      if (inserted)
        appIds.push({
          applicationId: inserted.id,
          jobId: inserted.job_id,
          candidateId: inserted.candidate_id,
        });
    }

    // 4) Fit scores for candidate–job pairs (include both demo candidates so their match feed + applications work)
    const fitScoresSeed = [
      {
        job_id: job1Id,
        candidate_id: c1,
        overall_score: 88,
        skills_score: 90,
        experience_score: 85,
        summary: "Strong match. React/Node experience aligns; validate system design in interview.",
        red_flags: [],
        interview_angles: ["System design", "Scale experience"],
        dimensions: {
          skillsMatch: { score: 90 },
          experienceRelevance: { score: 85 },
          seniorityAlignment: { score: 88 },
          locationAvailability: { score: 90 },
          signalFreshness: { score: 85 },
        },
      },
      {
        job_id: job1Id,
        candidate_id: c3,
        overall_score: 82,
        skills_score: 85,
        experience_score: 80,
        summary: "Solid full stack background. Slight gap on fintech domain.",
        red_flags: ["No fintech"],
        interview_angles: ["Past product ownership"],
        dimensions: {
          skillsMatch: { score: 85 },
          experienceRelevance: { score: 80 },
          seniorityAlignment: { score: 82 },
          locationAvailability: { score: 78 },
          signalFreshness: { score: 88 },
        },
      },
      {
        job_id: job2Id,
        candidate_id: c4,
        overall_score: 85,
        skills_score: 88,
        experience_score: 82,
        summary: "Relevant PM experience. Good stakeholder and analytics skills.",
        red_flags: [],
        interview_angles: ["Roadmap prioritization", "Metrics"],
        dimensions: {
          skillsMatch: { score: 88 },
          experienceRelevance: { score: 82 },
          seniorityAlignment: { score: 85 },
          locationAvailability: { score: 90 },
          signalFreshness: { score: 80 },
        },
      },
      {
        job_id: job2Id,
        candidate_id: c2,
        overall_score: 72,
        skills_score: 70,
        experience_score: 75,
        summary: "Data/analytics background; less PM experience. Could fit data-heavy PM roles.",
        red_flags: ["Limited PM"],
        interview_angles: ["Data-driven decisions"],
        dimensions: {
          skillsMatch: { score: 70 },
          experienceRelevance: { score: 75 },
          seniorityAlignment: { score: 72 },
          locationAvailability: { score: 85 },
          signalFreshness: { score: 78 },
        },
      },
      {
        job_id: job4Id,
        candidate_id: c2,
        overall_score: 86,
        skills_score: 88,
        experience_score: 82,
        summary: "Strong data analyst match. SQL, Python, and viz skills align well.",
        red_flags: [],
        interview_angles: ["A/B testing", "Dashboards"],
        dimensions: {
          skillsMatch: { score: 88 },
          experienceRelevance: { score: 82 },
          seniorityAlignment: { score: 86 },
          locationAvailability: { score: 90 },
          signalFreshness: { score: 85 },
        },
      },
    ].filter((f) => f.job_id);
    const fitScoreIds: Record<string, string> = {};
    for (const f of fitScoresSeed) {
      const { data: inserted } = await admin
        .from("fit_scores")
        .insert(f)
        .select("id, job_id, candidate_id")
        .single();
      if (inserted) {
        const key = `${inserted.job_id}:${inserted.candidate_id}`;
        fitScoreIds[key] = inserted.id;
      }
    }

    // Optionally link fit_scores to applications
    for (const app of appIds) {
      const key = `${app.jobId}:${app.candidateId}`;
      const fitId = fitScoreIds[key];
      if (fitId) {
        await admin
          .from("applications")
          .update({ fit_score_id: fitId })
          .eq("id", app.applicationId);
      }
    }

    // 5) Pipeline stages for first two jobs
    const stageNames = ["Shortlist", "Phone screen", "Technical", "Final"];
    const stageIdsByJob: Record<string, string[]> = {};
    for (const jobId of [job1Id, job2Id]) {
      const stages: string[] = [];
      for (let i = 0; i < stageNames.length; i++) {
        const name = stageNames[i];
        const { data: s } = await admin
          .from("pipeline_stages")
          .insert({ job_id: jobId, stage_name: name, stage_order: i + 1 })
          .select("id")
          .single();
        if (s?.id) stages.push(s.id);
      }
      stageIdsByJob[jobId] = stages;
    }

    // 6) Pipeline candidates (shortlisted candidates in pipeline)
    const pipelineSeed: {
      job_id: string;
      candidate_id: string;
      stage_index: number;
    }[] = [
      { job_id: job1Id, candidate_id: c1, stage_index: 1 },
      { job_id: job1Id, candidate_id: c3, stage_index: 0 },
      { job_id: job2Id, candidate_id: c4, stage_index: 1 },
    ];
    for (const p of pipelineSeed) {
      const stageIds = stageIdsByJob[p.job_id];
      const stageId = stageIds?.[p.stage_index] ?? null;
      await admin.from("pipeline_candidates").insert({
        job_id: p.job_id,
        candidate_id: p.candidate_id,
        stage_id: stageId,
        status: "shortlisted",
        unlocked: true,
      });
    }

    return jsonSuccess({
      message: "Finstack seed complete. You can test jobs, candidates, applications, and pipeline.",
      orgId,
      jobsCreated: jobIds.length,
      financeManagerJobId: financeManagerJobId ?? null,
      candidatesCreated: candidateIds.length,
      applicationsCreated: appIds.length,
      fitScoresCreated: Object.keys(fitScoreIds).length,
      pipelineStagesCreated: Object.values(stageIdsByJob).flat().length,
      pipelineCandidatesCreated: pipelineSeed.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const detail = err instanceof Error ? err.stack : undefined;
    return NextResponse.json(
      {
        error: "Finstack seed failed",
        detail: message,
        ...(process.env.NODE_ENV === "development" && detail && { stack: detail }),
      },
      { status: 500 },
    );
  }
}

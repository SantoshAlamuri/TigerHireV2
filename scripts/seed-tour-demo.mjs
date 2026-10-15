/**
 * Seed additional high-volume, realistic demo data for the 90-second product tour.
 *
 * Prerequisites:
 * 1) demo users seeded
 * 2) finstack seed run (jobs + baseline pipeline)
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-tour-demo.mjs
 */

import { createClient } from "@supabase/supabase-js";

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function scoreFor(index) {
  const base = [91, 88, 84, 79, 75, 71, 67, 62, 58, 53];
  return base[index % base.length];
}

function statusFor(index) {
  if (index < 10) return "applied";
  if (index < 16) return "viewed";
  return "shortlisted";
}

function buildCandidateSeed() {
  const names = [
    "Aarav Nair",
    "Meera Kapoor",
    "Rohan Bhat",
    "Kavya Shetty",
    "Ishan Malhotra",
    "Pooja Menon",
    "Nikhil Arora",
    "Sana Mirza",
    "Harsh Vora",
    "Ananya Joshi",
    "Dev Patel",
    "Ritika Jain",
    "Yash Bansal",
    "Sneha Kulkarni",
    "Varun Chadha",
    "Priyanka Rao",
    "Karan Sethi",
    "Ira Banerjee",
    "Omkar Deshpande",
    "Neha Nambiar",
    "Aditi Pillai",
    "Rahul Verma",
    "Shruti Iyer",
    "Zain Siddiqui",
    "Naina Bhagat",
    "Akash Tandon",
    "Tanvi Prakash",
    "Pranav Khanna",
  ];
  const cities = ["Bengaluru", "Pune", "Hyderabad", "Chennai", "Mumbai", "Gurugram"];
  const roleSignals = [
    "Backend Engineer",
    "Full Stack Engineer",
    "Platform Engineer",
    "Data Engineer",
    "Senior Software Engineer",
  ];
  return names.map((name, index) => {
    const n = String(index + 1).padStart(2, "0");
    const experienceYears = 2 + (index % 8);
    const city = cities[index % cities.length];
    const roleSignal = roleSignals[index % roleSignals.length];
    return {
      index,
      email: `tour.candidate.${n}@finstack.demo`,
      phone: `+9198100${String(1200 + index).padStart(4, "0")}`,
      candidate: {
        name,
        email: `tour.candidate.${n}@finstack.demo`,
        phone: `+9198100${String(1200 + index).padStart(4, "0")}`,
        location: city,
        skills: [
          "TypeScript",
          "Node.js",
          "PostgreSQL",
          index % 2 === 0 ? "React" : "AWS",
          index % 3 === 0 ? "Distributed systems" : "REST APIs",
        ],
        experience_years: experienceYears,
        intent_score: Math.max(55, 92 - index),
      },
      roleSignal,
    };
  });
}

async function upsertCandidate(supabase, payload) {
  const existing = await supabase
    .from("candidates")
    .select("id")
    .eq("email", payload.email)
    .limit(1)
    .maybeSingle();
  if (existing.error) {
    throw new Error(`Failed reading candidate ${payload.email}: ${existing.error.message}`);
  }
  if (existing.data?.id) return existing.data.id;

  const inserted = await supabase.from("candidates").insert(payload).select("id").single();
  if (inserted.error || !inserted.data?.id) {
    throw new Error(
      `Failed inserting candidate ${payload.email}: ${inserted.error?.message ?? "no id"}`,
    );
  }
  return inserted.data.id;
}

async function ensureApplication(supabase, candidateId, jobId, status) {
  const existing = await supabase
    .from("applications")
    .select("id")
    .eq("candidate_id", candidateId)
    .eq("job_id", jobId)
    .limit(1)
    .maybeSingle();
  if (existing.error) {
    throw new Error(
      `Failed reading application for candidate ${candidateId}: ${existing.error.message}`,
    );
  }
  if (existing.data?.id) return existing.data.id;

  const inserted = await supabase
    .from("applications")
    .insert({
      candidate_id: candidateId,
      job_id: jobId,
      status,
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data?.id) {
    throw new Error(`Failed creating application: ${inserted.error?.message ?? "no id"}`);
  }
  return inserted.data.id;
}

async function ensureWaMessages(supabase, { applicationId, candidateName, roleSignal }) {
  const baseRows = [
    {
      application_id: applicationId,
      direction: "out",
      wa_message_id: `tour-out-${applicationId}`,
      template_name: "interview_nudge",
      body: `Hi ${candidateName}, thanks for applying for ${roleSignal}. Please share your latest availability for a quick screening call.`,
      status: "sent",
      raw_payload: { source: "tour-seed", direction: "out" },
    },
    {
      application_id: applicationId,
      direction: "in",
      wa_message_id: `tour-in-${applicationId}`,
      template_name: null,
      body: "Thanks. I can do tomorrow 11:30 AM or 4:00 PM IST.",
      status: "received",
      raw_payload: { source: "tour-seed", direction: "in" },
    },
  ];

  for (const row of baseRows) {
    const inserted = await supabase.from("wa_messages").insert(row);
    if (!inserted.error) continue;
    if (inserted.error.code === "23505") continue;
    if (inserted.error.message?.includes('relation "wa_messages" does not exist')) {
      return false;
    }
    throw new Error(`Failed seeding wa_messages: ${inserted.error.message}`);
  }
  return true;
}

async function ensureFitScore(supabase, { candidateId, jobId, score, roleSignal }) {
  const existing = await supabase
    .from("fit_scores")
    .select("id")
    .eq("candidate_id", candidateId)
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) {
    throw new Error(
      `Failed reading fit score for candidate ${candidateId}: ${existing.error.message}`,
    );
  }
  if (existing.data?.id) return existing.data.id;

  const verdict = score >= 82 ? "Strong fit" : score >= 68 ? "Borderline fit" : "Pass for now";
  const base = {
    job_id: jobId,
    candidate_id: candidateId,
    overall_score: score,
    skills_score: Math.min(98, score + 3),
    experience_score: Math.max(45, score - 4),
    summary: `${verdict}. ${roleSignal} signal is ${score >= 80 ? "strong" : "mixed"} for this role.`,
    red_flags:
      score < 65
        ? [
            "Depth in large-scale systems not clearly evidenced",
            "Leadership scope needs validation",
          ]
        : [],
    interview_angles: [
      "Walk through one production incident and recovery approach",
      "Explain ownership scope in last two projects",
      "Demonstrate trade-off thinking for reliability vs velocity",
    ],
    dimensions: {
      skillsMatch: {
        score: Math.min(99, score + 4),
        label: "Skills match",
        reasoning: "Core stack overlap is visible across recent projects.",
        weight: 0.32,
      },
      experienceRelevance: {
        score: Math.max(45, score - 3),
        label: "Experience relevance",
        reasoning: "Past role depth aligns with required ownership level.",
        weight: 0.26,
      },
      seniorityAlignment: {
        score: Math.max(50, score - 5),
        label: "Seniority alignment",
        reasoning: "Seniority mostly aligns; validate decision-making scope.",
        weight: 0.2,
      },
      locationAvailability: {
        score: 88,
        label: "Location availability",
        reasoning: "Candidate indicates hybrid flexibility for India time zone.",
        weight: 0.12,
      },
      signalFreshness: {
        score: 84,
        label: "Signal freshness",
        reasoning: "Recent project evidence available in CV.",
        weight: 0.1,
      },
    },
  };

  const inserted = await supabase.from("fit_scores").insert(base).select("id").single();
  if (inserted.error || !inserted.data?.id) {
    throw new Error(`Failed creating fit score: ${inserted.error?.message ?? "no id"}`);
  }

  await supabase
    .from("fit_scores")
    .update({
      verdict,
      verdict_action:
        score >= 82
          ? "Proceed to interview with confidence"
          : score >= 68
            ? "Proceed with focused validation"
            : "Keep in reserve and continue sourcing",
      confidence: score >= 82 ? "high" : score >= 68 ? "medium" : "low",
      green_flags:
        score >= 75
          ? [
              "Hands-on backend ownership in current role",
              "Strong TypeScript and API design evidence",
              "Clear examples of production debugging",
            ]
          : ["Comfortable with core stack and delivery cadence"],
      amber_flags:
        score >= 70
          ? ["Scope inflation risk: verify team size and direct ownership"]
          : ["Role-fit confidence is moderate; validate architecture depth"],
      one_line_summary:
        score >= 82
          ? "Strong fit with defensible skill-depth evidence."
          : score >= 68
            ? "Borderline fit; interview should validate architecture depth."
            : "Pass for now due to gap in required ownership depth.",
    })
    .eq("id", inserted.data.id);

  return inserted.data.id;
}

async function ensurePipelineCandidate(supabase, { candidateId, jobId, stageId, status }) {
  const existing = await supabase
    .from("pipeline_candidates")
    .select("id")
    .eq("candidate_id", candidateId)
    .eq("job_id", jobId)
    .limit(1)
    .maybeSingle();
  if (existing.error) {
    throw new Error(
      `Failed reading pipeline candidate for ${candidateId}: ${existing.error.message}`,
    );
  }
  if (existing.data?.id) return existing.data.id;

  const inserted = await supabase
    .from("pipeline_candidates")
    .insert({
      candidate_id: candidateId,
      job_id: jobId,
      stage_id: stageId ?? null,
      status,
      unlocked: true,
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data?.id) {
    throw new Error(`Failed inserting pipeline candidate: ${inserted.error?.message ?? "no id"}`);
  }
  return inserted.data.id;
}

async function main() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const orgRes = await supabase
    .from("organisations")
    .select("id, name")
    .ilike("name", "Finstack")
    .limit(1)
    .maybeSingle();
  if (orgRes.error) throw new Error(`Failed loading organisation: ${orgRes.error.message}`);
  if (!orgRes.data?.id) {
    throw new Error("Finstack org not found. Run demo-user and finstack seeds first.");
  }
  const orgId = orgRes.data.id;

  const jobsRes = await supabase
    .from("jobs")
    .select("id, title")
    .eq("organisation_id", orgId)
    .eq("status", "open")
    .order("created_at", { ascending: true });
  if (jobsRes.error) throw new Error(`Failed loading jobs: ${jobsRes.error.message}`);
  if (!jobsRes.data?.length) {
    throw new Error("No open jobs found for Finstack. Run finstack seed first.");
  }

  const primaryJob =
    jobsRes.data.find((job) => String(job.title).includes("[Seed] Senior Full Stack Engineer")) ??
    jobsRes.data[0];
  const secondaryJob = jobsRes.data[1] ?? primaryJob;

  const stagesRes = await supabase
    .from("pipeline_stages")
    .select("id, stage_name, stage_order")
    .eq("job_id", primaryJob.id)
    .order("stage_order", { ascending: true });
  if (stagesRes.error)
    throw new Error(`Failed loading pipeline stages: ${stagesRes.error.message}`);
  const stages = stagesRes.data ?? [];
  const stageByName = new Map(
    stages.map((stage) => [String(stage.stage_name).toLowerCase(), stage]),
  );
  const shortlistStage = stageByName.get("shortlist") ?? stages[0] ?? null;
  const screenStage = stageByName.get("phone screen") ?? stages[1] ?? shortlistStage ?? null;
  const technicalStage =
    stageByName.get("technical") ?? stages[2] ?? screenStage ?? shortlistStage ?? null;

  const seed = buildCandidateSeed();
  let candidatesCreated = 0;
  let applicationsCreated = 0;
  let scoresCreated = 0;
  let pipelineCreated = 0;
  let waMessagesSeeded = 0;
  let waAvailable = true;

  for (const row of seed) {
    const existingCandidate = await supabase
      .from("candidates")
      .select("id")
      .eq("email", row.email)
      .limit(1)
      .maybeSingle();
    if (existingCandidate.error) {
      throw new Error(`Failed checking candidate ${row.email}: ${existingCandidate.error.message}`);
    }
    const candidateId =
      existingCandidate.data?.id ?? (await upsertCandidate(supabase, row.candidate));
    if (!existingCandidate.data?.id) candidatesCreated += 1;

    const targetJobId = row.index % 4 === 0 ? secondaryJob.id : primaryJob.id;
    const status = statusFor(row.index);

    const existingApp = await supabase
      .from("applications")
      .select("id")
      .eq("candidate_id", candidateId)
      .eq("job_id", targetJobId)
      .limit(1)
      .maybeSingle();
    if (existingApp.error) {
      throw new Error(`Failed checking application for ${row.email}: ${existingApp.error.message}`);
    }
    const applicationId =
      existingApp.data?.id ?? (await ensureApplication(supabase, candidateId, targetJobId, status));
    if (!existingApp.data?.id) {
      applicationsCreated += 1;
    }

    if (waAvailable) {
      const seeded = await ensureWaMessages(supabase, {
        applicationId,
        candidateName: row.candidate.name,
        roleSignal: row.roleSignal,
      });
      if (!seeded) {
        waAvailable = false;
      } else {
        waMessagesSeeded += 2;
      }
    }

    const existingScore = await supabase
      .from("fit_scores")
      .select("id")
      .eq("candidate_id", candidateId)
      .eq("job_id", targetJobId)
      .limit(1)
      .maybeSingle();
    if (existingScore.error) {
      throw new Error(`Failed checking fit score for ${row.email}: ${existingScore.error.message}`);
    }
    if (!existingScore.data?.id) {
      await ensureFitScore(supabase, {
        candidateId,
        jobId: targetJobId,
        score: scoreFor(row.index),
        roleSignal: row.roleSignal,
      });
      scoresCreated += 1;
    }

    if (status === "shortlisted") {
      const stageId = technicalStage?.id ?? screenStage?.id ?? shortlistStage?.id ?? null;
      const existingPipeline = await supabase
        .from("pipeline_candidates")
        .select("id")
        .eq("candidate_id", candidateId)
        .eq("job_id", targetJobId)
        .limit(1)
        .maybeSingle();
      if (existingPipeline.error) {
        throw new Error(
          `Failed checking pipeline row for ${row.email}: ${existingPipeline.error.message}`,
        );
      }
      if (!existingPipeline.data?.id) {
        await ensurePipelineCandidate(supabase, {
          candidateId,
          jobId: targetJobId,
          stageId,
          status,
        });
        pipelineCreated += 1;
      }
    }
  }

  console.log("Tour demo seed complete.");
  console.log(`  Org: ${orgRes.data.name}`);
  console.log(`  Primary job: ${primaryJob.title}`);
  console.log(`  Candidates created: ${candidatesCreated}`);
  console.log(`  Applications created: ${applicationsCreated}`);
  console.log(`  Fit scores created: ${scoresCreated}`);
  console.log(`  Pipeline candidates created: ${pipelineCreated}`);
  if (waAvailable) {
    console.log(`  WhatsApp messages ensured: ${waMessagesSeeded}`);
  } else {
    console.log("  WhatsApp messages skipped: wa_messages table not available in this environment");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

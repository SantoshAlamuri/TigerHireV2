import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_ID = process.env.TEST_ORG_ID ?? null;
const ORG_SLUG = process.env.TEST_ORG_SLUG ?? "razorpay";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const IDS = {
  hiringRequests: {
    normal: "f1000000-0000-0000-0000-000000000001",
    financeApprove: "f1000000-0000-0000-0000-000000000002",
    financeReject: "f1000000-0000-0000-0000-000000000003",
    counter: "f1000000-0000-0000-0000-000000000004",
    withdrawn: "f1000000-0000-0000-0000-000000000005",
    accepted: "f1000000-0000-0000-0000-000000000006",
  },
  jobs: {
    normal: "f2000000-0000-0000-0000-000000000001",
    financeApprove: "f2000000-0000-0000-0000-000000000002",
    financeReject: "f2000000-0000-0000-0000-000000000003",
    counter: "f2000000-0000-0000-0000-000000000004",
    withdrawn: "f2000000-0000-0000-0000-000000000005",
    accepted: "f2000000-0000-0000-0000-000000000006",
  },
  candidates: {
    normal: "f3000000-0000-0000-0000-000000000001",
    financeApprove: "f3000000-0000-0000-0000-000000000002",
    financeReject: "f3000000-0000-0000-0000-000000000003",
    counter: "f3000000-0000-0000-0000-000000000004",
    withdrawn: "f3000000-0000-0000-0000-000000000005",
    accepted: "f3000000-0000-0000-0000-000000000006",
  },
  applications: {
    normal: "f4000000-0000-0000-0000-000000000001",
    financeApprove: "f4000000-0000-0000-0000-000000000002",
    financeReject: "f4000000-0000-0000-0000-000000000003",
    counter: "f4000000-0000-0000-0000-000000000004",
    withdrawn: "f4000000-0000-0000-0000-000000000005",
    accepted: "f4000000-0000-0000-0000-000000000006",
  },
  offers: {
    normalDraft: "f5000000-0000-0000-0000-000000000001",
    financeApprovedPending: "f5000000-0000-0000-0000-000000000002",
    financeRejectedPending: "f5000000-0000-0000-0000-000000000003",
    sentCounter: "f5000000-0000-0000-0000-000000000004",
    withdrawn: "f5000000-0000-0000-0000-000000000005",
    accepted: "f5000000-0000-0000-0000-000000000006",
  },
  pipelineStages: {
    normal: "f6000000-0000-0000-0000-000000000001",
    financeApprove: "f6000000-0000-0000-0000-000000000002",
    financeReject: "f6000000-0000-0000-0000-000000000003",
    counter: "f6000000-0000-0000-0000-000000000004",
    withdrawn: "f6000000-0000-0000-0000-000000000005",
    accepted: "f6000000-0000-0000-0000-000000000006",
  },
  pipelineCandidates: {
    normal: "f7000000-0000-0000-0000-000000000001",
    financeApprove: "f7000000-0000-0000-0000-000000000002",
    financeReject: "f7000000-0000-0000-0000-000000000003",
    counter: "f7000000-0000-0000-0000-000000000004",
    withdrawn: "f7000000-0000-0000-0000-000000000005",
    accepted: "f7000000-0000-0000-0000-000000000006",
  },
  compensationBand: "f8000000-0000-0000-0000-000000000001",
};

function isoDaysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function resolveOrganisation() {
  if (ORG_ID) {
    const { data, error } = await admin
      .from("organisations")
      .select("id, name, slug")
      .eq("id", ORG_ID)
      .maybeSingle();
    if (error || !data) throw new Error(`Organisation not found for TEST_ORG_ID=${ORG_ID}`);
    return data;
  }

  const { data, error } = await admin
    .from("organisations")
    .select("id, name, slug")
    .eq("slug", ORG_SLUG)
    .maybeSingle();
  if (error || !data) {
    throw new Error(
      `Organisation not found for TEST_ORG_SLUG=${ORG_SLUG}. Set TEST_ORG_ID to target a specific org.`,
    );
  }
  return data;
}

async function resolveOrgActors(orgId) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, role, full_name")
    .eq("organisation_id", orgId);
  if (error) throw new Error(`Failed to read org profiles: ${error.message}`);
  if (!data || data.length === 0) throw new Error("No profiles found in organisation");

  const pick = (role) => data.find((p) => p.role === role)?.id ?? null;
  const any = data[0]?.id ?? null;
  const actor = {
    companyAdminId: pick("leadership") ?? any,
    recruiterId: pick("recruiter") ?? pick("leadership") ?? any,
    hiringManagerId: pick("hiring_manager") ?? pick("leadership") ?? any,
    financeId: pick("finance") ?? pick("leadership") ?? any,
  };

  if (!actor.companyAdminId || !actor.recruiterId || !actor.hiringManagerId || !actor.financeId) {
    throw new Error(
      "Could not resolve required actor profiles (admin/recruiter/hiring_manager/finance)",
    );
  }
  return actor;
}

async function seedRolePermissions(orgId) {
  const permissions = {
    recruiterCanCreateOffers: true,
    recruiterCanSendOffers: true,
    hiringManagerCanCreateOffers: true,
    hiringManagerCanSendOffers: false,
    offerFinanceApprovalWorkflowKey: "offer_finance_v1",
    offerFinanceApprovalMode: "always",
    offerLetterFlow: {
      steps: ["Select candidate", "Pick CTC calculator", "Apply CTC", "Create offer draft"],
      ctcCalculators: [
        {
          key: "eng_standard",
          name: "Engineering Standard",
          components: [
            { label: "Base / fixed pay", annual: 1800000, formula: null },
            { label: "HRA", annual: null, formula: { basis: "base", percent: 40 } },
            { label: "Employer PF", annual: null, formula: { basis: "base", percent: 12 } },
            { label: "Special allowance", annual: 300000, formula: null },
          ],
        },
        {
          key: "sales_variable_heavy",
          name: "Sales Variable Heavy",
          components: [
            { label: "Base / fixed pay", annual: 1200000, formula: null },
            {
              label: "Sales incentive pool",
              annual: null,
              formula: { basis: "base", percent: 35 },
            },
            { label: "Travel allowance", annual: 180000, formula: null },
          ],
        },
      ],
      defaultCalculatorKey: "eng_standard",
    },
  };

  const { error } = await admin.from("role_permission_settings").upsert(
    {
      organisation_id: orgId,
      permissions,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organisation_id" },
  );
  if (error) throw new Error(`Failed to upsert role permission settings: ${error.message}`);
}

async function seedHiringRequests(orgId, createdBy) {
  const rows = [
    [IDS.hiringRequests.normal, "REQ-E2E-001", "Backend Engineer - Normal Path", "urgent"],
    [
      IDS.hiringRequests.financeApprove,
      "REQ-E2E-002",
      "Product Manager - Finance Approve Path",
      "high",
    ],
    [IDS.hiringRequests.financeReject, "REQ-E2E-003", "Data Analyst - Finance Reject Path", "high"],
    [IDS.hiringRequests.counter, "REQ-E2E-004", "Sales Manager - Candidate Counter Path", "normal"],
    [IDS.hiringRequests.withdrawn, "REQ-E2E-005", "QA Lead - Withdrawn Offer Path", "normal"],
    [
      IDS.hiringRequests.accepted,
      "REQ-E2E-006",
      "Platform Engineer - Accepted Signing Path",
      "urgent",
    ],
  ].map(([id, code, title, urgency]) => ({
    id,
    organisation_id: orgId,
    created_by: createdBy,
    req_code: code,
    title,
    department: "Engineering",
    urgency,
    status: "approved",
    submitted_at: isoDaysFromNow(-8),
    created_at: isoDaysFromNow(-9),
    updated_at: isoDaysFromNow(-1),
  }));

  const { error } = await admin.from("hiring_requests").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`Failed to upsert hiring requests: ${error.message}`);
}

async function seedJobs(orgId, createdBy, hiringManagerId) {
  const defs = [
    [IDS.jobs.normal, IDS.hiringRequests.normal, "Backend Engineer"],
    [IDS.jobs.financeApprove, IDS.hiringRequests.financeApprove, "Product Manager"],
    [IDS.jobs.financeReject, IDS.hiringRequests.financeReject, "Data Analyst"],
    [IDS.jobs.counter, IDS.hiringRequests.counter, "Sales Manager"],
    [IDS.jobs.withdrawn, IDS.hiringRequests.withdrawn, "QA Lead"],
    [IDS.jobs.accepted, IDS.hiringRequests.accepted, "Platform Engineer"],
  ];

  const rows = defs.map(([id, hrId, title], idx) => ({
    id,
    organisation_id: orgId,
    created_by: createdBy,
    hiring_manager_id: hiringManagerId,
    title,
    description: `${title} role created for end-to-end offer workflow testing.`,
    location: "Bengaluru",
    status: "open",
    shortlist_due_at: isoDaysFromNow(2 + idx),
    role_function: "engineering",
    show_salary: false,
    list_on_public_job_board: false,
    list_for_internal_referrals: true,
    hiring_request_id: hrId,
    created_at: isoDaysFromNow(-8 + idx),
    updated_at: isoDaysFromNow(-1),
  }));

  const { error } = await admin.from("jobs").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`Failed to upsert jobs: ${error.message}`);

  for (const [jobId, hrId] of defs) {
    const { error: hrError } = await admin
      .from("hiring_requests")
      .update({ assigned_job_id: jobId, status: "converted", updated_at: new Date().toISOString() })
      .eq("id", hrId);
    if (hrError) throw new Error(`Failed to back-link hiring request ${hrId}: ${hrError.message}`);
  }
}

async function seedCandidatesAndApplications(orgId) {
  const candidates = [
    [IDS.candidates.normal, "E2E Normal Candidate", "e2e.normal+offers@tigerhire.dev", "7"],
    [
      IDS.candidates.financeApprove,
      "E2E Finance Approve Candidate",
      "e2e.finance.approve@tigerhire.dev",
      "9",
    ],
    [
      IDS.candidates.financeReject,
      "E2E Finance Reject Candidate",
      "e2e.finance.reject@tigerhire.dev",
      "4",
    ],
    [IDS.candidates.counter, "E2E Counter Candidate", "e2e.counter@tigerhire.dev", "8"],
    [IDS.candidates.withdrawn, "E2E Withdrawn Candidate", "e2e.withdrawn@tigerhire.dev", "6"],
    [IDS.candidates.accepted, "E2E Accepted Candidate", "e2e.accepted@tigerhire.dev", "10"],
  ].map(([id, name, email, years], idx) => ({
    id,
    name,
    email,
    phone: `+91990000000${idx + 1}`,
    skills: ["TypeScript", "Next.js", "PostgreSQL"],
    experience_years: Number(years),
    location: "Bengaluru",
    visibility: true,
    created_at: isoDaysFromNow(-20),
    updated_at: isoDaysFromNow(-1),
  }));

  const { error: candError } = await admin
    .from("candidates")
    .upsert(candidates, { onConflict: "id" });
  if (candError) throw new Error(`Failed to upsert candidates: ${candError.message}`);

  const applications = [
    [IDS.applications.normal, IDS.candidates.normal, IDS.jobs.normal],
    [IDS.applications.financeApprove, IDS.candidates.financeApprove, IDS.jobs.financeApprove],
    [IDS.applications.financeReject, IDS.candidates.financeReject, IDS.jobs.financeReject],
    [IDS.applications.counter, IDS.candidates.counter, IDS.jobs.counter],
    [IDS.applications.withdrawn, IDS.candidates.withdrawn, IDS.jobs.withdrawn],
    [IDS.applications.accepted, IDS.candidates.accepted, IDS.jobs.accepted],
  ].map(([id, candidateId, jobId]) => ({
    id,
    candidate_id: candidateId,
    job_id: jobId,
    status: "shortlisted",
    interest: "strong_interest",
    cover_note: "Seeded application for offer workflow validation.",
    created_at: isoDaysFromNow(-7),
    updated_at: isoDaysFromNow(-1),
  }));

  const { error: appError } = await admin
    .from("applications")
    .upsert(applications, { onConflict: "id" });
  if (appError) throw new Error(`Failed to upsert applications: ${appError.message}`);
}

async function seedPipeline(hiringManagerEmail) {
  const stages = [
    [IDS.pipelineStages.normal, IDS.jobs.normal],
    [IDS.pipelineStages.financeApprove, IDS.jobs.financeApprove],
    [IDS.pipelineStages.financeReject, IDS.jobs.financeReject],
    [IDS.pipelineStages.counter, IDS.jobs.counter],
    [IDS.pipelineStages.withdrawn, IDS.jobs.withdrawn],
    [IDS.pipelineStages.accepted, IDS.jobs.accepted],
  ].map(([id, jobId], idx) => ({
    id,
    job_id: jobId,
    stage_name: "Compensation & Offer",
    stage_order: 5,
    interviewer_email: hiringManagerEmail,
    interviewer_name: "Hiring Manager",
  }));

  const { error: stageErr } = await admin
    .from("pipeline_stages")
    .upsert(stages, { onConflict: "id" });
  if (stageErr) throw new Error(`Failed to upsert pipeline stages: ${stageErr.message}`);

  const pipelineCandidates = [
    [
      IDS.pipelineCandidates.normal,
      IDS.jobs.normal,
      IDS.candidates.normal,
      IDS.pipelineStages.normal,
    ],
    [
      IDS.pipelineCandidates.financeApprove,
      IDS.jobs.financeApprove,
      IDS.candidates.financeApprove,
      IDS.pipelineStages.financeApprove,
    ],
    [
      IDS.pipelineCandidates.financeReject,
      IDS.jobs.financeReject,
      IDS.candidates.financeReject,
      IDS.pipelineStages.financeReject,
    ],
    [
      IDS.pipelineCandidates.counter,
      IDS.jobs.counter,
      IDS.candidates.counter,
      IDS.pipelineStages.counter,
    ],
    [
      IDS.pipelineCandidates.withdrawn,
      IDS.jobs.withdrawn,
      IDS.candidates.withdrawn,
      IDS.pipelineStages.withdrawn,
    ],
    [
      IDS.pipelineCandidates.accepted,
      IDS.jobs.accepted,
      IDS.candidates.accepted,
      IDS.pipelineStages.accepted,
    ],
  ].map(([id, jobId, candidateId, stageId]) => ({
    id,
    job_id: jobId,
    candidate_id: candidateId,
    stage_id: stageId,
    status: "in_progress",
    created_at: isoDaysFromNow(-6),
  }));

  const { error: pcErr } = await admin
    .from("pipeline_candidates")
    .upsert(pipelineCandidates, { onConflict: "id" });
  if (pcErr) throw new Error(`Failed to upsert pipeline candidates: ${pcErr.message}`);
}

async function seedCompBand(orgId) {
  const { error } = await admin.from("compensation_bands").upsert(
    {
      id: IDS.compensationBand,
      organisation_id: orgId,
      label: "IC3 Engineering",
      min_amount: 1200000,
      max_amount: 2200000,
      currency: "INR",
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`Failed to upsert compensation band: ${error.message}`);
}

async function seedOffers(orgId, actors) {
  const now = new Date().toISOString();
  const offers = [
    {
      id: IDS.offers.normalDraft,
      application_id: IDS.applications.normal,
      organisation_id: orgId,
      created_by: actors.recruiterId,
      role_title: "Backend Engineer",
      start_date: isoDaysFromNow(14).slice(0, 10),
      status: "draft",
      band_id: IDS.compensationBand,
      band_status: "within_band",
      compensation_json: {
        ctc: 1850000,
        ctc_calculator_key: "eng_standard",
        components: [{ label: "Base / fixed pay", annual: 1500000 }],
      },
      notes: "Case 1: HM approval then send (no finance).",
      created_at: isoDaysFromNow(-2),
      updated_at: now,
    },
    {
      id: IDS.offers.financeApprovedPending,
      application_id: IDS.applications.financeApprove,
      organisation_id: orgId,
      created_by: actors.recruiterId,
      role_title: "Product Manager",
      start_date: isoDaysFromNow(21).slice(0, 10),
      status: "pending_finance",
      band_id: IDS.compensationBand,
      band_status: "exception_pending",
      band_exception_reason: "Critical hire for Q2 release.",
      compensation_json: { ctc: 2600000 },
      notes: "Case 2: Finance approval path.",
      created_at: isoDaysFromNow(-2),
      updated_at: now,
    },
    {
      id: IDS.offers.financeRejectedPending,
      application_id: IDS.applications.financeReject,
      organisation_id: orgId,
      created_by: actors.recruiterId,
      role_title: "Data Analyst",
      start_date: isoDaysFromNow(30).slice(0, 10),
      status: "pending_finance",
      band_id: IDS.compensationBand,
      band_status: "exception_pending",
      band_exception_reason: "Candidate has niche domain premium.",
      compensation_json: { ctc: 2550000 },
      notes: "Case 3: Finance rejection path.",
      created_at: isoDaysFromNow(-3),
      updated_at: now,
    },
    {
      id: IDS.offers.sentCounter,
      application_id: IDS.applications.counter,
      organisation_id: orgId,
      created_by: actors.recruiterId,
      role_title: "Sales Manager",
      start_date: isoDaysFromNow(25).slice(0, 10),
      status: "pending_finance",
      signing_status: "sent",
      band_id: IDS.compensationBand,
      band_status: "exception_pending",
      compensation_json: { ctc: 2400000 },
      public_token: "seed-counter-offer-token",
      sent_at: isoDaysFromNow(-1),
      expires_at: isoDaysFromNow(6),
      notes: "Case 4: Candidate counter offer, now pending finance again.",
      created_at: isoDaysFromNow(-4),
      updated_at: now,
    },
    {
      id: IDS.offers.withdrawn,
      application_id: IDS.applications.withdrawn,
      organisation_id: orgId,
      created_by: actors.recruiterId,
      role_title: "QA Lead",
      start_date: isoDaysFromNow(18).slice(0, 10),
      status: "withdrawn",
      signing_status: "withdrawn",
      band_status: "within_band",
      compensation_json: { ctc: 1700000 },
      public_token: "seed-withdrawn-offer-token",
      sent_at: isoDaysFromNow(-2),
      expires_at: isoDaysFromNow(5),
      notes: "Case 5: Sent offer then recalled/withdrawn.",
      created_at: isoDaysFromNow(-5),
      updated_at: now,
    },
    {
      id: IDS.offers.accepted,
      application_id: IDS.applications.accepted,
      organisation_id: orgId,
      created_by: actors.recruiterId,
      role_title: "Platform Engineer",
      start_date: isoDaysFromNow(10).slice(0, 10),
      status: "accepted",
      signing_status: "signed",
      band_status: "within_band",
      compensation_json: { ctc: 2000000 },
      public_token: "seed-accepted-offer-token",
      sent_at: isoDaysFromNow(-3),
      signed_at: isoDaysFromNow(-1),
      expires_at: isoDaysFromNow(4),
      signer_name: "E2E Accepted Candidate",
      notes: "Case 6: Accepted and signed.",
      created_at: isoDaysFromNow(-6),
      updated_at: now,
    },
  ];

  const { error } = await admin.from("offers").upsert(offers, { onConflict: "id" });
  if (error) throw new Error(`Failed to upsert offers: ${error.message}`);
}

async function seedFinanceWorkflowAndDecisions(actors) {
  const approvals = [
    {
      id: "fc000000-0000-0000-0000-000000000001",
      offer_id: IDS.offers.accepted,
      approver_id: actors.hiringManagerId,
      decision: "approved",
      comment: "HM approved for release.",
      decided_at: isoDaysFromNow(-3),
      created_at: isoDaysFromNow(-3),
    },
  ];
  const { error: apprErr } = await admin
    .from("offer_approvals")
    .upsert(approvals, { onConflict: "id" });
  if (apprErr) throw new Error(`Failed to upsert offer approvals: ${apprErr.message}`);

  const responses = [
    {
      id: "fd000000-0000-0000-0000-000000000001",
      offer_id: IDS.offers.sentCounter,
      response: "counter",
      comment: "Requesting improved base salary and joining bonus.",
      responded_at: isoDaysFromNow(-1),
      created_at: isoDaysFromNow(-1),
    },
    {
      id: "fd000000-0000-0000-0000-000000000002",
      offer_id: IDS.offers.accepted,
      response: "accept",
      comment: "Accepted as discussed.",
      responded_at: isoDaysFromNow(-1),
      created_at: isoDaysFromNow(-1),
    },
  ];
  const { error: respErr } = await admin
    .from("offer_candidate_responses")
    .upsert(responses, { onConflict: "id" });
  if (respErr) throw new Error(`Failed to upsert offer candidate responses: ${respErr.message}`);
}

async function run() {
  console.log("Seeding offer-flow fixtures...");
  const org = await resolveOrganisation();
  console.log(`Organisation: ${org.name} (${org.id})`);

  const actors = await resolveOrgActors(org.id);
  console.log("Actors resolved:", actors);

  await seedRolePermissions(org.id);
  await seedHiringRequests(org.id, actors.recruiterId);
  await seedJobs(org.id, actors.recruiterId, actors.hiringManagerId);
  await seedCandidatesAndApplications(org.id);

  await seedPipeline("hm.offers@tigerhire.dev");

  await seedCompBand(org.id);
  await seedOffers(org.id, actors);
  await seedFinanceWorkflowAndDecisions(actors);

  console.log("\nSeed complete. Offer test cases:");
  console.log(`1) Normal draft                -> ${IDS.offers.normalDraft}`);
  console.log(`2) Pending finance (approve)   -> ${IDS.offers.financeApprovedPending}`);
  console.log(`3) Pending finance (reject)    -> ${IDS.offers.financeRejectedPending}`);
  console.log(`4) Candidate counter path      -> ${IDS.offers.sentCounter}`);
  console.log(`5) Withdrawn after send        -> ${IDS.offers.withdrawn}`);
  console.log(`6) Accepted + signed           -> ${IDS.offers.accepted}`);
}

run().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});

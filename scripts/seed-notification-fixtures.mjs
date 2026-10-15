/**
 * Seed auth users, profiles, candidates, applications, fit_scores, and saved_searches
 * so you can exercise email + WhatsApp flows on dev / staging using YOUR emails and phones.
 *
 * Prerequisites:
 *   - NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (e.g. from .env.local)
 *   - Finstack organisation (run seed-demo-users + seed:finstack first, or this script creates Finstack if missing)
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-notification-fixtures.mjs
 *
 * Configuration (pick one for candidates):
 *   NOTIFICATION_TEST_FIXTURES — JSON array, max 3 entries:
 *     [{ "email": "a@x.com", "phone": "919876543210", "fullName": "QA One" }, ...]
 *   OR legacy:
 *     NOTIFICATION_TEST_EMAIL_1 + NOTIFICATION_TEST_PHONE_1 + NOTIFICATION_TEST_NAME_1 (same for _2, _3)
 *
 * Optional recruiter (4th inbox for recruiter-targeted emails):
 *   NOTIFICATION_TEST_RECRUITER_EMAIL
 *   NOTIFICATION_TEST_RECRUITER_NAME (default "NotifyTest Recruiter")
 *
 * Password for created or reset users:
 *   SEED_DEMO_PASSWORD (default NotifyTest@2026)
 *
 * @see docs/NOTIFICATION_TEST_FIXTURES.md
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.SEED_DEMO_PASSWORD || "NotifyTest@2026";

const JOB_PREFIX = "[NotifyTest] ";
const APPLY_JOB_TITLE = `${JOB_PREFIX}Apply Flow — QA Engineer`;
const STATUS_JOB_TITLE = `${JOB_PREFIX}Status Flow — QA Engineer`;

function normalizePhone(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 10) {
    throw new Error(`Phone must have at least 10 digits: got "${raw}"`);
  }
  return digits;
}

function parseCandidatesFromEnv() {
  const json = process.env.NOTIFICATION_TEST_FIXTURES?.trim();
  if (json) {
    let arr;
    try {
      arr = JSON.parse(json);
    } catch (e) {
      throw new Error(`NOTIFICATION_TEST_FIXTURES must be valid JSON array: ${e.message}`);
    }
    if (!Array.isArray(arr) || arr.length === 0) {
      throw new Error("NOTIFICATION_TEST_FIXTURES must be a non-empty JSON array");
    }
    if (arr.length > 3) {
      throw new Error("NOTIFICATION_TEST_FIXTURES: max 3 candidates");
    }
    return arr.map((row, i) => {
      const email = String(row.email || "")
        .trim()
        .toLowerCase();
      if (!email.includes("@")) {
        throw new Error(`Entry ${i + 1}: invalid email`);
      }
      return {
        email,
        phone: normalizePhone(row.phone),
        fullName: String(row.fullName || `NotifyTest User ${i + 1}`).trim(),
      };
    });
  }

  const out = [];
  for (let i = 1; i <= 3; i++) {
    const email = process.env[`NOTIFICATION_TEST_EMAIL_${i}`]?.trim().toLowerCase();
    if (!email) continue;
    const phoneRaw = process.env[`NOTIFICATION_TEST_PHONE_${i}`];
    const name = process.env[`NOTIFICATION_TEST_NAME_${i}`]?.trim() || `NotifyTest User ${i}`;
    out.push({
      email,
      phone: normalizePhone(phoneRaw),
      fullName: name,
    });
  }
  if (out.length === 0) {
    throw new Error(
      "Set NOTIFICATION_TEST_FIXTURES (JSON array) or NOTIFICATION_TEST_EMAIL_1 (+ PHONE_1) in the environment.",
    );
  }
  if (out.length > 3) {
    throw new Error("Max 3 candidate slots (EMAIL_1..3).");
  }
  return out;
}

async function listAllUsers(adminAuth) {
  const users = [];
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await adminAuth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const batch = data?.users ?? [];
    users.push(...batch);
    if (batch.length < perPage) break;
    page++;
  }
  return users;
}

async function ensureAuthUser(adminAuth, email, fullName) {
  const all = await listAllUsers(adminAuth);
  const existing = all.find((u) => u.email?.toLowerCase() === email);
  if (existing) {
    const { error } = await adminAuth.admin.updateUserById(existing.id, {
      password,
      user_metadata: { full_name: fullName },
    });
    if (error) throw error;
    return existing.id;
  }
  const { data, error } = await adminAuth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw error;
  if (!data.user?.id) throw new Error(`createUser returned no id for ${email}`);
  return data.user.id;
}

async function ensureOrganisationFinstack(admin) {
  const { data: rows } = await admin
    .from("organisations")
    .select("id")
    .eq("name", "Finstack")
    .limit(1);
  if (rows?.[0]?.id) return rows[0].id;

  const { data: inserted, error } = await admin
    .from("organisations")
    .insert({
      type: "company",
      name: "Finstack",
      slug: "finstack",
      approval: "approved",
    })
    .select("id")
    .single();
  if (error) throw error;
  return inserted.id;
}

async function pickJobCreatorUserId(admin, orgId) {
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("organisation_id", orgId)
    .in("role", ["recruiter", "leadership", "hiring_manager"])
    .limit(1);
  return data?.[0]?.id ?? null;
}

async function ensureNotifyTestJob(admin, orgId, createdBy, title, description) {
  const { data: existing } = await admin
    .from("jobs")
    .select("id")
    .eq("organisation_id", orgId)
    .eq("title", title)
    .limit(1);
  if (existing?.[0]?.id) return existing[0].id;

  const { data: inserted, error } = await admin
    .from("jobs")
    .insert({
      organisation_id: orgId,
      created_by: createdBy,
      hiring_manager_id: createdBy,
      title,
      description,
      location: "Bangalore (Hybrid)",
      status: "open",
      compensation_min: 15,
      compensation_max: 35,
      skills_required: ["TypeScript", "React", "Node.js"],
    })
    .select("id")
    .single();
  if (error) throw error;
  return inserted.id;
}

async function removeApplicationForJob(admin, { candidateId, jobId }) {
  const { error } = await admin
    .from("applications")
    .delete()
    .eq("candidate_id", candidateId)
    .eq("job_id", jobId);
  if (error) throw error;
}

async function upsertProfile(admin, userId, { role, organisationId, fullName, phone }) {
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  const row = {
    id: userId,
    role,
    organisation_id: organisationId,
    full_name: fullName,
    updated_at: new Date().toISOString(),
    ...(phone ? { phone } : {}),
  };
  if (existing) {
    const { error } = await admin.from("profiles").update(row).eq("id", userId);
    if (error) throw error;
  } else {
    const { error } = await admin.from("profiles").insert(row);
    if (error) throw error;
  }
}

async function ensureCandidate(admin, { userId, email, phone, fullName }) {
  const { data: found } = await admin.from("candidates").select("id").eq("email", email).limit(1);
  const payload = {
    user_id: userId,
    name: fullName,
    email,
    phone,
    skills: ["TypeScript", "React", "Node.js"],
    experience_years: 5,
    location: "Bangalore",
    intent_score: 88,
    visibility: true,
    updated_at: new Date().toISOString(),
  };
  if (found?.[0]?.id) {
    const { error } = await admin.from("candidates").update(payload).eq("id", found[0].id);
    if (error) throw error;
    return found[0].id;
  }
  const { data: inserted, error } = await admin
    .from("candidates")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw error;
  return inserted.id;
}

async function ensureApplicationAndScore(admin, { candidateId, jobId }) {
  const { data: existingApp } = await admin
    .from("applications")
    .select("id")
    .eq("candidate_id", candidateId)
    .eq("job_id", jobId)
    .maybeSingle();

  let applicationId = existingApp?.id;
  if (!applicationId) {
    const { data: app, error: appErr } = await admin
      .from("applications")
      .insert({
        candidate_id: candidateId,
        job_id: jobId,
        status: "applied",
      })
      .select("id")
      .single();
    if (appErr) throw appErr;
    applicationId = app.id;
  }

  const { data: existingFs } = await admin
    .from("fit_scores")
    .select("id")
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .eq("is_test_run", false)
    .eq("run_index", 1)
    .maybeSingle();

  let fitScoreId = existingFs?.id;
  if (!fitScoreId) {
    const { data: fs, error: fsErr } = await admin
      .from("fit_scores")
      .insert({
        job_id: jobId,
        candidate_id: candidateId,
        overall_score: 87,
        skills_score: 90,
        experience_score: 85,
        summary: "NotifyTest fit score for email/WhatsApp QA.",
        red_flags: [],
        interview_angles: ["System design"],
        dimensions: {
          skillsMatch: { score: 90 },
          experienceRelevance: { score: 85 },
          seniorityAlignment: { score: 88 },
          locationAvailability: { score: 90 },
          signalFreshness: { score: 85 },
        },
        is_test_run: false,
        run_index: 1,
      })
      .select("id")
      .single();
    if (fsErr) throw fsErr;
    fitScoreId = fs.id;
  }

  await admin.from("applications").update({ fit_score_id: fitScoreId }).eq("id", applicationId);
  return { applicationId, fitScoreId };
}

async function ensurePipelineForStatusJob(admin, { jobId, candidateIds }) {
  const stageDefs = [
    { stage_name: "Shortlist", stage_order: 1 },
    { stage_name: "Phone screen", stage_order: 2 },
    { stage_name: "Technical", stage_order: 3 },
    { stage_name: "Final", stage_order: 4 },
  ];

  const stageIds = [];
  for (const s of stageDefs) {
    const { data: existing } = await admin
      .from("pipeline_stages")
      .select("id")
      .eq("job_id", jobId)
      .eq("stage_name", s.stage_name)
      .maybeSingle();
    if (existing?.id) {
      stageIds.push(existing.id);
      continue;
    }
    const { data: inserted, error } = await admin
      .from("pipeline_stages")
      .insert({ job_id: jobId, stage_name: s.stage_name, stage_order: s.stage_order })
      .select("id")
      .single();
    if (error) throw error;
    stageIds.push(inserted.id);
  }

  const shortlistStageId = stageIds[0] ?? null;
  for (const candidateId of candidateIds) {
    const { data: existingPc } = await admin
      .from("pipeline_candidates")
      .select("id")
      .eq("job_id", jobId)
      .eq("candidate_id", candidateId)
      .maybeSingle();

    if (existingPc?.id) {
      await admin
        .from("pipeline_candidates")
        .update({
          stage_id: shortlistStageId,
          status: "shortlisted",
          unlocked: true,
          unlocked_at: new Date().toISOString(),
        })
        .eq("id", existingPc.id);
      continue;
    }

    const { error } = await admin.from("pipeline_candidates").insert({
      job_id: jobId,
      candidate_id: candidateId,
      stage_id: shortlistStageId,
      status: "shortlisted",
      unlocked: true,
      unlocked_at: new Date().toISOString(),
    });
    if (error) throw error;
  }
}

async function ensureSavedSearchForAlerts(admin, userId) {
  await admin.from("saved_searches").delete().eq("user_id", userId).like("name", `${JOB_PREFIX}%`);

  const { error } = await admin.from("saved_searches").insert({
    user_id: userId,
    name: `${JOB_PREFIX}Daily digest`,
    filters: {},
    alert_enabled: true,
    alert_frequency: "daily",
    last_alerted_at: null,
  });
  if (error) throw error;
}

async function ensureEmailPreferencesAllOn(admin, userId) {
  const { data: existing } = await admin
    .from("email_preferences")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return;
  const { error } = await admin.from("email_preferences").insert({
    user_id: userId,
    marketing: true,
    job_alerts: true,
    application_updates: true,
    messages: true,
    interview_reminders: true,
    weekly_digest: true,
  });
  if (error) throw error;
}

async function main() {
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const candidatesSpec = parseCandidatesFromEnv();
  const recruiterEmail = process.env.NOTIFICATION_TEST_RECRUITER_EMAIL?.trim().toLowerCase();
  const recruiterName =
    process.env.NOTIFICATION_TEST_RECRUITER_NAME?.trim() || "NotifyTest Recruiter";

  for (const c of candidatesSpec) {
    if (recruiterEmail && c.email === recruiterEmail) {
      throw new Error("Recruiter email must differ from candidate emails.");
    }
  }

  const orgId = await ensureOrganisationFinstack(admin);
  const createdBy = await pickJobCreatorUserId(admin, orgId);
  const applyJobId = await ensureNotifyTestJob(
    admin,
    orgId,
    createdBy,
    APPLY_JOB_TITLE,
    "Synthetic job for candidate apply notification QA. No application is pre-created so testers can trigger the real apply flow.",
  );
  const statusJobId = await ensureNotifyTestJob(
    admin,
    orgId,
    createdBy,
    STATUS_JOB_TITLE,
    "Synthetic job for candidate status, interview, and reminder notification QA. Applications and fit scores are pre-created.",
  );

  const summary = {
    organisationId: orgId,
    applyJobId,
    applyJobTitle: APPLY_JOB_TITLE,
    statusJobId,
    statusJobTitle: STATUS_JOB_TITLE,
    passwordHint: "SEED_DEMO_PASSWORD or default NotifyTest@2026",
    candidates: [],
    pipelineSeededForCandidateCount: 0,
    recruiter: null,
  };

  const statusJobCandidateIds = [];
  for (const spec of candidatesSpec) {
    const userId = await ensureAuthUser(admin.auth, spec.email, spec.fullName);
    await upsertProfile(admin, userId, {
      role: "candidate_pro",
      organisationId: null,
      fullName: spec.fullName,
      phone: spec.phone,
    });
    await ensureEmailPreferencesAllOn(admin, userId);
    const candidateId = await ensureCandidate(admin, {
      userId,
      email: spec.email,
      phone: spec.phone,
      fullName: spec.fullName,
    });
    await removeApplicationForJob(admin, {
      candidateId,
      jobId: applyJobId,
    });
    const { applicationId, fitScoreId } = await ensureApplicationAndScore(admin, {
      candidateId,
      jobId: statusJobId,
    });
    statusJobCandidateIds.push(candidateId);
    await ensureSavedSearchForAlerts(admin, userId);
    summary.candidates.push({
      email: spec.email,
      phone: spec.phone,
      userId,
      candidateId,
      applyReadyJobId: applyJobId,
      applicationId,
      fitScoreId,
    });
  }

  await ensurePipelineForStatusJob(admin, {
    jobId: statusJobId,
    candidateIds: statusJobCandidateIds,
  });
  summary.pipelineSeededForCandidateCount = statusJobCandidateIds.length;

  if (recruiterEmail) {
    const rid = await ensureAuthUser(admin.auth, recruiterEmail, recruiterName);
    await upsertProfile(admin, rid, {
      role: "recruiter",
      organisationId: orgId,
      fullName: recruiterName,
      phone: null,
    });
    await ensureEmailPreferencesAllOn(admin, rid);
    summary.recruiter = { email: recruiterEmail, userId: rid };
  }

  console.log(JSON.stringify({ ok: true, summary }, null, 2));
  console.log(
    "\nNext: open docs/NOTIFICATION_TEST_FIXTURES.md and run the manual triggers (dashboard + cron + WhatsApp).",
  );
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});

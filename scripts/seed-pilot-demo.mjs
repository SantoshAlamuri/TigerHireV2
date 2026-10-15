/**
 * Seed / configure one demo-ready job for pilot video + screening E2E.
 *
 * Prerequisites:
 *   - .env.local with SUPABASE_SERVICE_ROLE_KEY
 *   - Finstack org exists (npm run seed:finstack)
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-pilot-demo.mjs
 */

import { createClient } from "@supabase/supabase-js";

function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

const DEMO_JOB_TITLE = "Backend Engineer";

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: org } = await admin
    .from("organisations")
    .select("id, name")
    .ilike("name", "%finstack%")
    .limit(1)
    .maybeSingle();

  if (!org?.id) {
    console.error("Finstack organisation not found. Run npm run seed:finstack first.");
    process.exit(1);
  }

  let { data: job } = await admin
    .from("jobs")
    .select("id, title, organisation_id")
    .eq("organisation_id", org.id)
    .ilike("title", DEMO_JOB_TITLE)
    .limit(1)
    .maybeSingle();

  if (!job) {
    const { data: created, error } = await admin
      .from("jobs")
      .insert({
        organisation_id: org.id,
        title: DEMO_JOB_TITLE,
        status: "open",
        description: "Pilot demo role — backend APIs, system design, PostgreSQL.",
        location: "Bengaluru",
      })
      .select("id, title")
      .single();
    if (error) {
      console.error("Failed to create demo job:", error.message);
      process.exit(1);
    }
    job = created;
    console.log("Created job:", job.id, job.title);
  } else {
    console.log("Using existing job:", job.id, job.title);
  }

  const { data: jdBase } = await admin
    .from("jd_base_documents")
    .select("id, approved_at, role_title")
    .eq("job_id", job.id)
    .maybeSingle();

  if (!jdBase) {
    console.log(
      "No JD Base yet — open the job in UI or POST /api/fitscore/jd-base to generate from template.",
    );
  } else if (!jdBase.approved_at) {
    await admin
      .from("jd_base_documents")
      .update({ approved_at: new Date().toISOString(), approved_by: null })
      .eq("job_id", job.id);
    console.log("Approved JD Base for", jdBase.role_title);
  } else {
    console.log("JD Base already approved:", jdBase.role_title);
  }

  const { data: plan } = await admin
    .from("recruitment_plans")
    .select("id")
    .eq("job_id", job.id)
    .maybeSingle();

  if (plan?.id) {
    const { data: phoneStage } = await admin
      .from("plan_stages")
      .select("id, display_name, stage_type, comms_template")
      .eq("plan_id", plan.id)
      .eq("stage_type", "phone_screen")
      .eq("is_active", true)
      .maybeSingle();

    if (phoneStage) {
      const updates = {};
      if (!phoneStage.comms_template) {
        updates.comms_template = "th_screening_invite";
        updates.comms_template_id = "th_screening_invite";
      }
      if (Object.keys(updates).length > 0) {
        await admin.from("plan_stages").update(updates).eq("id", phoneStage.id);
        console.log("Set th_screening_invite on Phone Screen plan stage");
      }
    } else {
      console.log("Add a phone_screen plan stage in the UI for screening E2E.");
    }
  } else {
    console.log("Open job Plan tab once to create recruitment plan + pipeline.");
  }

  console.log("\nPilot demo job ready checklist:");
  console.log("  Job ID:", job.id);
  console.log("  Org:", org.name);
  console.log("  Plan flags: node scripts/print-plan-beta-env.mjs");
  console.log("  Screening E2E: docs/briefs/pilot-operating-system.md#screening-verification");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

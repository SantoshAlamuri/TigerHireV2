/**
 * The original escalation script, extended into a regression test.
 *
 *  1. agency self-inserts a link  -> must NOT grant access (pending)
 *  2. company activates it        -> access granted
 *  3. company deactivates it      -> access revoked (is_active was a no-op before)
 *  4. company revokes it          -> access revoked
 *
 * PREVIEW project only. Cleans up after itself.
 */
import { readFileSync } from "node:fs";
import { randomUUID, randomBytes } from "node:crypto";
import { createClient } from "/Users/santoshalamuri/TigerHire/TigerHire/node_modules/@supabase/supabase-js/dist/index.mjs";

const envText = readFileSync("/Users/santoshalamuri/TigerHire/TigerHire/.env.local", "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (!m) continue;
  env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
if (!URL.includes("htdyomyhkvhcwoeodwas")) throw new Error(`Refusing non-preview project: ${URL}`);
const admin = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const tag = randomBytes(3).toString("hex");
const created = { orgs: [], users: [], jobs: [], candidates: [], pipeline: [], stages: [] };
const results = [];

function check(label, pass, detail = "") {
  results.push({ label, pass });
  console.log(`${pass ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const { data: victim } = await admin
    .from("organisations")
    .insert({
      type: "company",
      name: `Victim Co ${tag}`,
      slug: `victim-co-${tag}`,
      approval: "approved",
    })
    .select("id")
    .single();
  created.orgs.push(victim.id);

  const { data: attacker } = await admin
    .from("organisations")
    .insert({
      type: "agency",
      name: `Attacker Agency ${tag}`,
      slug: `attacker-agency-${tag}`,
      approval: "approved",
    })
    .select("id")
    .single();
  created.orgs.push(attacker.id);

  const email = `agency-test-${tag}@example.com`;
  const password = `Tst-${randomBytes(12).toString("hex")}!A1`;
  const { data: userRes } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  created.users.push(userRes.user.id);
  await admin.from("profiles").upsert({
    id: userRes.user.id,
    role: "agency",
    organisation_id: attacker.id,
    full_name: "Agency Tester",
    email,
  });

  const { data: job } = await admin
    .from("jobs")
    .insert({
      organisation_id: victim.id,
      title: `Confidential Role ${tag}`,
      description: "secret",
      status: "open",
    })
    .select("id")
    .single();
  created.jobs.push(job.id);

  const { data: cand } = await admin
    .from("candidates")
    .insert({ name: `Victim Candidate ${tag}`, email: `cand-${tag}@example.com` })
    .select("id")
    .single();
  created.candidates.push(cand.id);

  // Without a stage row, `stages` reads 0 even when access IS granted, so the
  // grant path on pipeline_stages would look identical to a correct denial.
  const { data: stage, error: stageErr } = await admin
    .from("pipeline_stages")
    .insert({ job_id: job.id, stage_name: `Screen ${tag}`, stage_order: 1 })
    .select("id")
    .single();
  if (stageErr) throw new Error(`pipeline_stage: ${stageErr.message}`);
  created.stages.push(stage.id);

  const { data: pc } = await admin
    .from("pipeline_candidates")
    .insert({ job_id: job.id, candidate_id: cand.id, status: "active" })
    .select("id")
    .single();
  created.pipeline.push(pc.id);

  const asAgency = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await asAgency.auth.signInWithPassword({ email, password });

  const visible = async () => {
    const pcs = await asAgency.from("pipeline_candidates").select("id").eq("job_id", job.id);
    const jobs = await asAgency.from("jobs").select("id").eq("id", job.id);
    const stages = await asAgency.from("pipeline_stages").select("id").eq("job_id", job.id);
    return {
      pipeline: pcs.data?.length ?? 0,
      jobs: jobs.data?.length ?? 0,
      stages: stages.data?.length ?? 0,
    };
  };

  console.log("\n--- 1. agency self-inserts the link (the original exploit) ---");
  const ins = await asAgency
    .from("agency_clients")
    .insert({ agency_organisation_id: attacker.id, client_organisation_id: victim.id })
    .select("id, status, is_active")
    .single();

  if (ins.error) {
    check("insert rejected outright", true, ins.error.message);
  } else {
    check(
      "self-inserted link is NOT active",
      ins.data.status === "pending",
      `status=${ins.data.status}`,
    );
  }

  const afterInsert = await visible();
  check(
    "pending link grants NO access",
    afterInsert.pipeline === 0 && afterInsert.jobs === 0 && afterInsert.stages === 0,
    JSON.stringify(afterInsert),
  );

  const linkId = ins.data?.id;
  if (!linkId) {
    console.log("\n(no link row to promote — insert was rejected; remaining checks skipped)");
    return;
  }

  console.log("\n--- 2. the company approves it ---");
  await admin
    .from("agency_clients")
    .update({ status: "active", decided_at: new Date().toISOString() })
    .eq("id", linkId);
  const afterApprove = await visible();
  check(
    "approved link grants access on pipeline, jobs AND stages",
    afterApprove.pipeline === 1 && afterApprove.jobs === 1 && afterApprove.stages === 1,
    JSON.stringify(afterApprove),
  );

  console.log("\n--- 3. the company deactivates it (is_active used to be a no-op here) ---");
  await admin.from("agency_clients").update({ is_active: false }).eq("id", linkId);
  const afterDeactivate = await visible();
  check(
    "is_active=false revokes access on every table",
    afterDeactivate.pipeline === 0 && afterDeactivate.jobs === 0 && afterDeactivate.stages === 0,
    JSON.stringify(afterDeactivate),
  );

  console.log("\n--- 4. the company revokes it ---");
  await admin
    .from("agency_clients")
    .update({ is_active: true, status: "revoked" })
    .eq("id", linkId);
  const afterRevoke = await visible();
  check(
    "status=revoked revokes access",
    afterRevoke.pipeline === 0 && afterRevoke.jobs === 0 && afterRevoke.stages === 0,
    JSON.stringify(afterRevoke),
  );

  await asAgency.auth.signOut();
}

async function cleanup() {
  await admin.from("agency_clients").delete().in("client_organisation_id", created.orgs);
  const del = async (t, ids) => ids.length && (await admin.from(t).delete().in("id", ids));
  await del("pipeline_candidates", created.pipeline);
  await del("pipeline_stages", created.stages);
  await del("candidates", created.candidates);
  await del("jobs", created.jobs);
  for (const id of created.users) {
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
  }
  await del("organisations", created.orgs);
}

try {
  await main();
  const failed = results.filter((r) => !r.pass);
  console.log(
    `\n==== ${failed.length === 0 ? `ALL ${results.length} CHECKS PASSED` : `${failed.length} FAILED: ${failed.map((f) => f.label).join("; ")}`} ====\n`,
  );
} catch (err) {
  console.error("ERROR:", err.message, err.stack);
} finally {
  await cleanup();
  console.log("cleanup done");
}

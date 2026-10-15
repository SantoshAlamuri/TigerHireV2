/**
 * Pilot DB assertions ("Sam validates") — run after UI/webhook steps.
 *
 * Usage:
 *   node --env-file=.env.local --env-file=.env.pilot-e2e.local scripts/pilot-db-assertions.mjs
 *   npm run pilot:db-check
 */
import dotenv from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
dotenv.config({ path: path.join(root, ".env.local") });
dotenv.config({ path: path.join(root, ".env.pilot-e2e.local") });

function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function fail(msg) {
  console.error("✗", msg);
  process.exitCode = 1;
}

function pass(msg) {
  console.log("✓", msg);
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const jobTitle = (process.env.PILOT_JOB_TITLE ?? "Senior Backend Engineer").trim();
  const { data: jobs } = await admin
    .from("jobs")
    .select("id, title, status")
    .ilike("title", `%${jobTitle.split("—")[0].trim()}%`)
    .limit(5);

  if (!jobs?.length) {
    fail(`No job matching title fragment: ${jobTitle}`);
  } else {
    pass(`Found ${jobs.length} job(s) matching "${jobTitle}"`);
  }

  for (const demo of [
    "lakshmi.interviewer@finstack.in",
    "lakshmi.finance@finstack.in",
    "rajiv.menon@finstack.in",
  ]) {
    const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const u = users?.users?.find((x) => x.email?.toLowerCase() === demo);
    if (!u) {
      fail(`Auth user missing: ${demo}`);
      continue;
    }
    const { data: profile } = await admin
      .from("profiles")
      .select("role, phone, is_org_admin")
      .eq("id", u.id)
      .maybeSingle();
    if (!profile?.role) fail(`Profile missing for ${demo}`);
    else pass(`${demo} role=${profile.role} phone=${profile.phone ?? "(none)"}`);
  }

  const { count: sessionCount } = await admin
    .from("whatsapp_sessions")
    .select("id", { count: "exact", head: true });
  console.log(`whatsapp_sessions rows (total): ${sessionCount ?? 0}`);

  if (process.exitCode) {
    console.error("\nAssertions failed.");
    process.exit(1);
  }
  console.log("\nAll pilot DB checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

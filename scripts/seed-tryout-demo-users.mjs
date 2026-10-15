/**
 * Seed shared demo accounts for the TigerHire Tryout app (tryout.tigerhire.io).
 *
 * Usage:
 *   TRYOUT_ORG_ID=187ccc3b-d33f-4b33-91fa-b4d688734369 \
 *   node --env-file=.env.local scripts/seed-tryout-demo-users.mjs
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const tryoutOrgId = (process.env.TRYOUT_ORG_ID ?? "187ccc3b-d33f-4b33-91fa-b4d688734369").trim();

const DEMO_PASSWORD = process.env.TRYOUT_DEMO_PASSWORD ?? "TryoutDemo2026!";
const ACCOUNT_COUNT = Number(process.env.TRYOUT_DEMO_ACCOUNT_COUNT ?? "10");

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!tryoutOrgId) {
  console.error("Missing TRYOUT_ORG_ID");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function pad(n) {
  return String(n).padStart(2, "0");
}

const DEMO_USERS = Array.from({ length: ACCOUNT_COUNT }, (_, i) => {
  const n = i + 1;
  const suffix = pad(n);
  return {
    email: `demo${suffix}@tryout.tigerhire.io`,
    password: DEMO_PASSWORD,
    fullName: `Tryout Demo ${suffix}`,
    role: "agency",
    orgId: tryoutOrgId,
  };
});

async function findUserByEmail(email) {
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function createProfile(userId, u) {
  const { error } = await admin.from("profiles").upsert(
    {
      id: userId,
      role: u.role,
      organisation_id: u.orgId,
      full_name: u.fullName,
      is_active: true,
      role_status: "active",
    },
    { onConflict: "id" },
  );

  if (error) throw new Error(`profile ${u.email}: ${error.message}`);
}

async function ensureUser(u) {
  const { data, error } = await admin.auth.admin.createUser({
    email: u.email,
    password: u.password,
    email_confirm: true,
    user_metadata: { full_name: u.fullName },
  });

  if (error) {
    if (!error.message.includes("already been registered")) {
      throw new Error(`create ${u.email}: ${error.message}`);
    }
    const existing = await findUserByEmail(u.email);
    if (!existing) throw new Error(`create ${u.email}: already registered but not found`);
    await admin.auth.admin.updateUserById(existing.id, { password: u.password });
    await createProfile(existing.id, u);
    return { email: u.email, userId: existing.id, created: false };
  }

  await createProfile(data.user.id, u);
  return { email: u.email, userId: data.user.id, created: true };
}

async function main() {
  console.log(`Tryout org: ${tryoutOrgId}`);
  console.log(`Creating/updating ${DEMO_USERS.length} demo accounts...\n`);

  const results = [];
  for (const u of DEMO_USERS) {
    const result = await ensureUser(u);
    results.push(result);
    console.log(`${result.created ? "created" : "updated"} ${result.email} (${result.userId})`);
  }

  console.log("\nDemo accounts (rotate across sessions to avoid the 5-CV-per-job cap):\n");
  for (const u of DEMO_USERS) {
    console.log(`  ${u.email}  /  ${u.password}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

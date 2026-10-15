/**
 * Pilot exhaustive E2E — pre-test setup (accounts, phones, session cleanup).
 *
 * Usage:
 *   node --env-file=.env.local --env-file=.env.pilot-e2e.local scripts/pilot-pretest-setup.mjs
 *   npm run pilot:pretest
 */
import dotenv from "dotenv";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
dotenv.config({ path: path.join(root, ".env.local") });
dotenv.config({ path: path.join(root, ".env.pilot-e2e.local") });

function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function pilotPassword() {
  return process.env.PILOT_PASSWORD ?? process.env.SEED_DEMO_PASSWORD ?? "demo123";
}

function normalizePhone(raw) {
  if (!raw?.trim()) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length >= 10) return digits;
  return null;
}

const EXTRA_PILOT_USERS = [
  {
    email: "lakshmi.interviewer@finstack.in",
    role: "interviewer",
    fullName: "Lakshmi Interviewer",
    orgName: "Finstack",
  },
  {
    email: "lakshmi.finance@finstack.in",
    role: "finance",
    fullName: "Lakshmi Finance",
    orgName: "Finstack",
  },
];

const PHONE_PROFILE_MAP = [
  { env: "PILOT_PHONE_RAJIV", email: "rajiv.menon@finstack.in" },
  { env: "PILOT_PHONE_MEERA", email: "meera.nair@finstack.in" },
  { env: "PILOT_PHONE_INTERVIEWER", email: "lakshmi.interviewer@finstack.in" },
];

async function ensureOrg(admin, name, type) {
  const { data: rows } = await admin.from("organisations").select("id").eq("name", name).limit(1);
  if (rows?.[0]?.id) return rows[0].id;
  const slug = name.toLowerCase().replace(/\s+/g, "-");
  const { data: inserted, error } = await admin
    .from("organisations")
    .insert({ type, name, slug, approval: "approved" })
    .select("id")
    .single();
  if (error) throw new Error(`organisations insert ${name}: ${error.message}`);
  return inserted.id;
}

async function ensureAuthUser(admin, email, password, fullName) {
  const lower = email.toLowerCase();
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users?.find((u) => u.email?.toLowerCase() === lower);
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, { password });
    return existing;
  }
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return created.user;
}

async function upsertProfile(admin, userId, { role, orgId, fullName, phone, isOrgAdmin }) {
  const patch = {
    role,
    organisation_id: orgId,
    full_name: fullName,
    is_org_admin: Boolean(isOrgAdmin),
    updated_at: new Date().toISOString(),
  };
  if (phone) patch.phone = phone;
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.id) {
    const { error } = await admin.from("profiles").update(patch).eq("id", userId);
    if (error) throw new Error(`profiles update: ${error.message}`);
  } else {
    const { error } = await admin.from("profiles").insert({ id: userId, ...patch });
    if (error) throw new Error(`profiles insert: ${error.message}`);
  }
}

async function clearWhatsAppState(admin, phones) {
  for (const phone of phones) {
    await admin.from("whatsapp_sessions").delete().eq("phone", phone);
    await admin.from("consent_records").delete().eq("phone", phone);
  }
}

async function seedViaHttp(baseUrl) {
  const url = `${baseUrl.replace(/\/$/, "")}/api/auth/seed-demo-users`;
  try {
    const res = await fetch(url, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      console.log("HTTP seed-demo-users:", data.message ?? "ok");
    } else {
      console.warn("HTTP seed-demo-users skipped:", res.status, data.error ?? "");
    }
  } catch (err) {
    console.warn("HTTP seed-demo-users unreachable:", err.message);
  }
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const password = pilotPassword();
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const baseUrl = process.env.PILOT_BASE_URL ?? "http://localhost:3000";
  await seedViaHttp(baseUrl);

  const finstackId = await ensureOrg(admin, "Finstack", "company");
  const talentBridgeId = await ensureOrg(admin, "TalentBridge", "agency");

  if (finstackId && talentBridgeId) {
    const { data: link } = await admin
      .from("agency_clients")
      .select("id")
      .eq("agency_organisation_id", talentBridgeId)
      .eq("client_organisation_id", finstackId)
      .maybeSingle();
    if (!link?.id) {
      const { error: linkErr } = await admin.from("agency_clients").insert({
        agency_organisation_id: talentBridgeId,
        client_organisation_id: finstackId,
      });
      if (linkErr) console.warn("  agency_clients Finstack↔TalentBridge:", linkErr.message);
      else console.log("  ✓ agency client link: TalentBridge → Finstack");
    } else {
      console.log("  ✓ agency client link already exists");
    }
  }

  console.log("Ensuring pilot accounts (interviewer, finance)…");
  for (const demo of EXTRA_PILOT_USERS) {
    const user = await ensureAuthUser(admin, demo.email, password, demo.fullName);
    await upsertProfile(admin, user.id, {
      role: demo.role,
      orgId: finstackId,
      fullName: demo.fullName,
      isOrgAdmin: false,
    });
    console.log("  ✓", demo.email, `(${demo.role})`);
  }

  console.log("Updating profile phones from env…");
  const phonesToClear = new Set();
  for (const { env, email } of PHONE_PROFILE_MAP) {
    const phone = normalizePhone(process.env[env]);
    if (!phone) continue;
    const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const authUser = users?.users?.find((u) => u.email?.toLowerCase() === email);
    if (!authUser) {
      console.warn("  skip phone (no auth user):", email);
      continue;
    }
    const { error } = await admin.from("profiles").update({ phone }).eq("id", authUser.id);
    if (error) console.warn("  phone update failed:", email, error.message);
    else {
      console.log("  ✓", email, "→", phone);
      phonesToClear.add(phone);
    }
  }

  for (const key of [
    "PILOT_PHONE_SHATABDI",
    "PILOT_PHONE_SNIGDHA",
    "PILOT_PHONE_SANTOSH_NO",
    "PILOT_PHONE_LAKSHMI",
    "PILOT_PHONE_FRESH",
  ]) {
    const p = normalizePhone(process.env[key]);
    if (p) phonesToClear.add(p);
  }

  if (phonesToClear.size > 0) {
    console.log("Clearing WhatsApp sessions/consent for", phonesToClear.size, "phone(s)…");
    await clearWhatsAppState(admin, [...phonesToClear]);
  }

  console.log("\nSeeding pilot lifecycle fixtures (gate candidate, Tasks, offer)…");
  const seed = spawnSync(
    "npx",
    ["tsx", "--env-file=.env.local", "scripts/pilot-seed-lifecycle-data.ts"],
    { cwd: root, stdio: "inherit", env: process.env },
  );
  if (seed.status !== 0) {
    console.warn("pilot-seed-lifecycle-data exited", seed.status, "— run: npm run pilot:seed");
  }

  console.log("\nDone. Run: npm run pilot:pretest  then  npm run test:e2e:pilot");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

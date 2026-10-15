/**
 * Picks a real organisations.slug for Playwright and writes E2E_APPLY_ORG_SLUG to .env.local.
 * Prefers: slug "razorpay" if present → else first org with an open job → else first org slug.
 *
 * Usage: node --env-file=.env.local scripts/set-e2e-apply-slug.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const envLocalPath = resolve(process.cwd(), ".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (use --env-file=.env.local).",
  );
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function pickSlug() {
  const { data: all, error: orgErr } = await supabase
    .from("organisations")
    .select("id, slug, name")
    .order("created_at", { ascending: true });

  if (orgErr) {
    throw new Error(orgErr.message);
  }
  const orgs = (all ?? []).filter((o) => o.slug && String(o.slug).trim() !== "");
  if (orgs.length === 0) {
    throw new Error("No organisations with a non-empty slug found.");
  }

  const razorpay = orgs.find((o) => o.slug === "razorpay");
  if (razorpay) return { slug: "razorpay", reason: "organisations.slug=razorpay" };

  const { data: jobRow } = await supabase
    .from("jobs")
    .select("organisation_id")
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (jobRow?.organisation_id) {
    const hit = orgs.find((o) => o.id === jobRow.organisation_id);
    if (hit?.slug) {
      return { slug: String(hit.slug), reason: "first org with an open job" };
    }
  }

  return { slug: String(orgs[0].slug), reason: "first organisation by created_at" };
}

function upsertEnvLine(contents, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(contents)) {
    return contents.replace(re, line);
  }
  const trimmed = contents.replace(/\s*$/, "");
  const prefix = trimmed.length ? `${trimmed}\n\n` : "";
  return `${prefix}# Synced by scripts/set-e2e-apply-slug.mjs for Playwright (/apply/{slug})\n${line}\n`;
}

async function main() {
  const { slug, reason } = await pickSlug();
  let raw = "";
  try {
    raw = readFileSync(envLocalPath, "utf8");
  } catch {
    console.error(`Could not read ${envLocalPath}; create it first.`);
    process.exit(1);
  }

  const next = upsertEnvLine(raw, "E2E_APPLY_ORG_SLUG", slug);
  if (next === raw) {
    console.log(`E2E_APPLY_ORG_SLUG already set to ${slug} (${reason}). No change.`);
    return;
  }
  writeFileSync(envLocalPath, next, "utf8");
  console.log(`Wrote E2E_APPLY_ORG_SLUG=${slug} to .env.local (${reason}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

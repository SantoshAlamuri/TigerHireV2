#!/usr/bin/env node
/**
 * Check WhatsApp template approval state stored from Meta webhooks.
 *
 * TigerHire upserts `whatsapp_template_status` when Meta POSTs
 * `message_template_status_update` to POST /api/webhooks/whatsapp.
 *
 * Usage:
 *   node --env-file=.env.local scripts/check-whatsapp-template-status-webhook.mjs
 *   node --env-file=.env.local scripts/check-whatsapp-template-status-webhook.mjs --referral-only
 *   node --env-file=.env.local scripts/check-whatsapp-template-status-webhook.mjs --all
 *
 * Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const REFERRAL_OUTREACH_TEMPLATES = [
  "th_application_received",
  "tigerhire_referred_candidate_v1",
  "tigerhire_referral_v1",
  "tigerhire_referral_v2",
  "tigerhire_consent_v1",
  "tigerhire_consent_v2",
];

const args = new Set(process.argv.slice(2));
const referralOnly =
  args.has("--referral-only") ||
  (!args.has("--all") && !args.has("--sync-meta") && args.size === 0);
const showAll = args.has("--all");
const syncMeta = args.has("--sync-meta");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);

function statusIcon(status) {
  const s = String(status ?? "").toUpperCase();
  if (s === "APPROVED" || s === "EXISTS_ON_WABA") return "✅";
  if (s === "PENDING") return "⏳";
  if (s === "REJECTED" || s === "DISABLED" || s === "PAUSED") return "❌";
  return "❓";
}

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION ?? "v22.0";

async function resolveWabaId(token, phoneId, wabaId) {
  if (wabaId) return wabaId;
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}?fields=whatsapp_business_account{id}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(`WABA lookup failed: ${JSON.stringify(data)}`);
  return data.whatsapp_business_account?.id;
}

async function listMetaTemplates(wabaId, token) {
  const templates = [];
  let url = `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/message_templates?fields=name,status,category,language&limit=500`;
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(`List templates failed: ${JSON.stringify(data)}`);
    if (data.data?.length) templates.push(...data.data);
    url = data.paging?.next ?? null;
  }
  return templates;
}

/** One-time backfill when webhook field is not subscribed yet. */
async function syncReferralTemplatesFromMeta(supabase) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const wabaIdEnv = process.env.WHATSAPP_WABA_ID?.trim() || process.env.META_WABA_ID?.trim();
  if (!token) {
    console.error("--sync-meta requires WHATSAPP_ACCESS_TOKEN");
    process.exit(1);
  }
  if (!wabaIdEnv && !phoneId) {
    console.error("--sync-meta requires WHATSAPP_WABA_ID or WHATSAPP_PHONE_NUMBER_ID");
    process.exit(1);
  }

  const wabaId = await resolveWabaId(token, phoneId, wabaIdEnv);
  const metaTemplates = await listMetaTemplates(wabaId, token);
  const now = new Date().toISOString();
  let upserted = 0;

  for (const name of REFERRAL_OUTREACH_TEMPLATES) {
    const matches = metaTemplates.filter((t) => t.name === name);
    if (!matches.length) {
      console.log(`  (skip) ${name} — not found in Meta WABA`);
      continue;
    }
    for (const t of matches) {
      const language = (t.language ?? "en").replace(/_/g, "_");
      const { error } = await supabase.from("whatsapp_template_status").upsert(
        {
          template_name: name,
          language,
          waba_id: wabaId,
          status: String(t.status ?? "UNKNOWN").toUpperCase(),
          category: t.category ?? null,
          last_event: "META_SYNC",
          status_updated_at: now,
        },
        { onConflict: "template_name,language" },
      );
      if (error) {
        console.warn(`  upsert failed ${name}/${language}:`, error.message);
      } else {
        upserted += 1;
        console.log(`  synced ${name} [${language}] → ${t.status}`);
      }
    }
  }
  console.log(`\nSynced ${upserted} row(s) from Meta (not a webhook event).\n`);
}

async function main() {
  if (syncMeta) {
    console.log("=== Sync referral templates from Meta Graph API ===\n");
    await syncReferralTemplatesFromMeta(supabase);
  }

  const { data, error } = await supabase
    .from("whatsapp_template_status")
    .select(
      "template_name, language, status, category, rejection_reason, meta_template_id, last_event, submitted_at, status_updated_at",
    )
    .order("status_updated_at", { ascending: false });

  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      console.error(
        "Table whatsapp_template_status missing. Apply supabase/migrations/20260518120000_whatsapp_template_status.sql",
      );
      process.exit(1);
    }
    console.error("Query failed:", error.message);
    process.exit(1);
  }

  const rows = data ?? [];
  const byName = new Map();
  for (const row of rows) {
    const key = `${row.template_name}:${row.language}`;
    if (!byName.has(key)) byName.set(key, row);
  }

  console.log("=== WhatsApp template status (from webhook + API submit) ===\n");
  console.log(
    "Source: Meta `message_template_status_update` → POST /api/webhooks/whatsapp → whatsapp_template_status\n",
  );

  if (rows.length === 0) {
    console.log("⚠️  No rows in whatsapp_template_status yet.\n");
    console.log("To populate via webhook:");
    console.log("  1. Meta App → WhatsApp → Configuration → Webhook");
    console.log("  2. Callback URL: https://<your-host>/api/webhooks/whatsapp");
    console.log("  3. Subscribe to field: message_template_status_update");
    console.log("  4. Verify token = WHATSAPP_WEBHOOK_SECRET");
    console.log("  5. Submit or edit a template in Meta — status events will upsert rows.\n");
    console.log("Also run: node scripts/audit-whatsapp-templates.mjs (live Meta Graph API)\n");
    process.exit(2);
  }

  const namesToCheck = showAll
    ? [...new Set(rows.map((r) => r.template_name))]
    : REFERRAL_OUTREACH_TEMPLATES;

  if (referralOnly && !showAll) {
    console.log("--- Referral / first-contact templates (employee refer path) ---\n");
  } else if (showAll) {
    console.log(`--- All ${rows.length} stored template rows ---\n`);
  }

  let missing = 0;
  let notApproved = 0;

  for (const name of namesToCheck) {
    const en = byName.get(`${name}:en`);
    const enUs = byName.get(`${name}:en_US`);
    const row = en ?? enUs;

    if (!row) {
      missing += 1;
      console.log(`  ❓ ${name}  — no webhook row (never received status update for en/en_US)`);
      continue;
    }

    const icon = statusIcon(row.status);
    const st = String(row.status ?? "").toUpperCase();
    if (st !== "APPROVED" && st !== "EXISTS_ON_WABA") notApproved += 1;

    const rej = row.rejection_reason ? `  rejection=${row.rejection_reason}` : "";
    const evt = row.last_event ? `  last_event=${row.last_event}` : "";
    const updated = row.status_updated_at
      ? `  updated=${new Date(row.status_updated_at).toISOString()}`
      : "";
    console.log(
      `  ${icon} ${row.template_name} [${row.language}]  status=${row.status}${rej}${evt}${updated}`,
    );
  }

  if (referralOnly && !showAll) {
    const critical =
      byName.get("th_application_received:en") ?? byName.get("th_application_received:en_US");
    console.log("\n--- Referral delivery hint ---");
    if (!critical) {
      console.log(
        "  Primary cold-contact template `th_application_received` has no webhook status — referrals may fail until APPROVED.",
      );
    } else if (String(critical.status).toUpperCase() !== "APPROVED") {
      console.log(
        `  ` +
          `th_application_received is ${critical.status} — fix in Meta or wait for APPROVED webhook.`,
      );
    } else {
      console.log(
        "  th_application_received is APPROVED — template side OK; check outbound logs for 9849092255.",
      );
    }
  }

  console.log("\n--- Summary ---");
  console.log(`  Rows in DB (all languages): ${rows.length}`);
  if (!showAll) {
    console.log(`  Referral templates checked:  ${namesToCheck.length}`);
    console.log(`  Missing webhook data:        ${missing}`);
    console.log(`  Not APPROVED:                ${notApproved}`);
  }

  console.log("\nAdmin API: GET /api/admin/whatsapp-templates (super_admin session)");
  console.log("Live Meta: node scripts/audit-whatsapp-templates.mjs\n");

  if (referralOnly && !showAll && (missing > 0 || notApproved > 0)) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});

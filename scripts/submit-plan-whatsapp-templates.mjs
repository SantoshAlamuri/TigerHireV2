#!/usr/bin/env node
/**
 * Submit plan-pilot WhatsApp templates to Meta (Graph API) and record PENDING in DB.
 * Meta sends APPROVED/REJECTED via message_template_status_update webhook → /api/webhooks/whatsapp
 *
 * Usage:
 *   node --env-file=.env.local scripts/submit-plan-whatsapp-templates.mjs
 *   node --env-file=.env.local scripts/submit-plan-whatsapp-templates.mjs --dry-run
 *
 * Requires:
 *   WHATSAPP_ACCESS_TOKEN, WHATSAPP_WABA_ID (or META_WHATSAPP_BUSINESS_ACCOUNT_ID)
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (optional; skips DB without them)
 *
 * Meta dashboard (operator):
 *   App → WhatsApp → Configuration → Webhook → Subscribe to message_template_status_update
 */
import { createClient } from "@supabase/supabase-js";

const GRAPH = "v22.0";
const token = (process.env.WHATSAPP_ACCESS_TOKEN ?? "").trim();
const waba = (
  process.env.WHATSAPP_WABA_ID ??
  process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID ??
  ""
).trim();
const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const dryRun = process.argv.includes("--dry-run");

const PLAN_TEMPLATES = [
  {
    name: "th_screening_invite",
    category: "UTILITY",
    language: "en",
    components: [
      {
        type: "BODY",
        text: "Hi {{1}}, {{2}} would like to ask a few quick screening questions to match you with the right role. Reply YES to start or NO to skip.",
        example: { body_text: [["Priya", "Acme Corp"]] },
      },
    ],
  },
];

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

async function submitTemplate(template) {
  const url = `https://graph.facebook.com/${GRAPH}/${waba}/message_templates`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(template),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

async function persistStatus(template, metaResult) {
  if (!supabaseUrl || !serviceKey) {
    console.log("  (skip DB — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to persist status)");
    return;
  }
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const now = new Date().toISOString();
  const already =
    !metaResult.ok &&
    (metaResult.data?.error?.code === 192 ||
      metaResult.data?.error?.error_subcode === 2388024 ||
      /already exists/i.test(metaResult.data?.error?.message ?? ""));
  const status = metaResult.ok
    ? (metaResult.data.status ?? "PENDING")
    : already
      ? "EXISTS_ON_WABA"
      : "SUBMIT_FAILED";

  const { error } = await admin.from("whatsapp_template_status").upsert(
    {
      template_name: template.name,
      language: template.language,
      waba_id: waba,
      meta_template_id: metaResult.data?.id ?? null,
      status,
      category: template.category,
      rejection_reason: metaResult.ok ? null : (metaResult.data?.error?.message ?? null),
      last_event: already ? "ALREADY_EXISTS" : metaResult.ok ? "API_SUBMIT" : "API_ERROR",
      submitted_at: now,
      status_updated_at: now,
    },
    { onConflict: "template_name,language" },
  );
  if (error) console.log(`  ⚠ DB upsert failed: ${error.message}`);
  else console.log(`  ✓ DB status → ${status}`);
}

async function main() {
  if (!token) fail("Missing WHATSAPP_ACCESS_TOKEN");
  if (!waba) fail("Missing WHATSAPP_WABA_ID");

  console.log(
    `\n=== Plan pilot WhatsApp templates → Meta WABA ${waba}${dryRun ? " (DRY RUN)" : ""} ===\n`,
  );
  console.log(
    "After submit, Meta reviews (1–72h). Subscribe webhook field message_template_status_update for live updates.\n",
  );

  for (const tpl of PLAN_TEMPLATES) {
    console.log(`→ ${tpl.name} [${tpl.category}]`);
    if (dryRun) {
      console.log("  (dry-run — skipped)");
      continue;
    }
    const r = await submitTemplate(tpl);
    if (r.ok) {
      console.log(`  ✓ Meta: ${r.data.status ?? "SUBMITTED"} — id ${r.data.id ?? "(n/a)"}`);
    } else {
      const msg = r.data?.error?.message ?? "(no message)";
      if (/already exists/i.test(msg) || r.data?.error?.code === 192) {
        console.log(`  ⊘ already on WABA`);
      } else {
        console.log(`  ✖ HTTP ${r.status}: ${msg}`);
      }
    }
    await persistStatus(tpl, r);
  }

  console.log("\nNext:");
  console.log("  1. Meta App → Webhook → subscribe message_template_status_update");
  console.log(
    "  2. GET /api/admin/whatsapp-templates (super_admin) or Supabase whatsapp_template_status",
  );
  console.log(
    "  3. When APPROVED, set WHATSAPP_SCREENING_TEMPLATE_NAME=th_screening_invite on preview\n",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

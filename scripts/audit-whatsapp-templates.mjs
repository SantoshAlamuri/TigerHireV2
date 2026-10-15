#!/usr/bin/env node
/**
 * Audit WhatsApp templates: fetch from Meta Graph API and cross-reference
 * against template names used in code.
 *
 * Usage: node scripts/audit-whatsapp-templates.mjs
 * Requires: WHATSAPP_ACCESS_TOKEN and (WHATSAPP_WABA_ID or WHATSAPP_PHONE_NUMBER_ID) in .env.local
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION ?? "v22.0";
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
const WABA_ID = process.env.WHATSAPP_WABA_ID?.trim();

if (!TOKEN) {
  console.error("Missing WHATSAPP_ACCESS_TOKEN in .env.local");
  process.exit(1);
}

const CODE_TEMPLATES = [
  // whatsapp.ts
  "tigerhire_session_expired",
  "th_job_match_result",
  "th_job_no_match",
  "th_preference_matches",
  "th_no_match_subscribed",
  "th_new_role_alert",
  "candidate_profile_claimed",
  "waitlist_confirmation",
  "th_shortlisted",
  "th_not_selected",
  "th_offer",
  "th_interview_slots",
  "th_interview_slot_picker",
  "th_interview_reminder",
  "th_sourcing",
  "th_referral_drive",
  "th_interview_rescheduled",
  "th_application_received",
  "th_profile_incomplete",
  "th_reengagement",
  "th_post_hire_pulse",
  // vouch.ts
  "th_referrer_vouch_request",
  // referrer-otp.ts
  "th_referrer_otp",
  // templates.ts
  "tigerhire_referral_v1",
  "tigerhire_referred_candidate_v1",
  "tigerhire_consent_v1",
  "tigerhire_fitscore_v1",
  "tigerhire_interview_v1",
  "tigerhire_reminder_v1",
  "tigerhire_employee_invite_v1",
];

async function resolveWabaId(phoneId, token) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}?fields=whatsapp_business_account{id}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(`WABA lookup failed: ${JSON.stringify(data)}`);
  return data.whatsapp_business_account?.id;
}

async function listTemplates(wabaId, token) {
  const templates = [];
  let url = `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/message_templates?fields=name,status,category,components&limit=500`;

  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(`List failed: ${JSON.stringify(data)}`);
    if (data.data?.length) templates.push(...data.data);
    url = data.paging?.next ?? null;
  }

  return templates;
}

async function main() {
  let wabaId = WABA_ID;
  if (!wabaId) {
    if (!PHONE_ID) {
      console.error("Need WHATSAPP_WABA_ID or WHATSAPP_PHONE_NUMBER_ID");
      process.exit(1);
    }
    wabaId = await resolveWabaId(PHONE_ID, TOKEN);
    console.log(`Resolved WABA ID: ${wabaId}\n`);
  }

  const metaTemplates = await listTemplates(wabaId, TOKEN);
  const metaMap = new Map();
  for (const t of metaTemplates) {
    metaMap.set(t.name, t);
  }

  console.log(`=== Meta Business Manager: ${metaTemplates.length} templates found ===\n`);

  console.log("--- All templates in Meta BM ---");
  for (const t of metaTemplates) {
    const bodyComp = t.components?.find((c) => c.type === "BODY");
    const varCount = bodyComp?.text?.match(/\{\{\d+\}\}/g)?.length ?? 0;
    console.log(
      `  ${t.status === "APPROVED" ? "✅" : "❌"} ${t.name}  [${t.status}]  category=${t.category}  vars=${varCount}`,
    );
  }

  console.log(`\n--- Cross-reference: ${CODE_TEMPLATES.length} template names in code ---\n`);

  const missing = [];
  const notApproved = [];
  const matched = [];

  for (const name of CODE_TEMPLATES) {
    const meta = metaMap.get(name);
    if (!meta) {
      missing.push(name);
      console.log(`  ❌ MISSING    ${name}`);
    } else if (meta.status !== "APPROVED") {
      notApproved.push({ name, status: meta.status });
      console.log(`  ⚠️  NOT APPROVED  ${name}  [${meta.status}]`);
    } else {
      matched.push(name);
      console.log(`  ✅ OK         ${name}  [${meta.category}]`);
    }
  }

  const extraInMeta = metaTemplates
    .filter((t) => !CODE_TEMPLATES.includes(t.name))
    .map((t) => t.name);

  console.log("\n--- Summary ---");
  console.log(`  Templates in Meta BM:        ${metaTemplates.length}`);
  console.log(`  Template names in code:       ${CODE_TEMPLATES.length}`);
  console.log(`  Matched & approved:           ${matched.length}`);
  console.log(`  Missing from Meta BM:         ${missing.length}`);
  console.log(`  In Meta but not approved:     ${notApproved.length}`);
  console.log(`  In Meta but not used in code: ${extraInMeta.length}`);

  if (missing.length) {
    console.log(`\n⚠️  MISSING TEMPLATES (will fail at runtime):`);
    for (const n of missing) console.log(`    - ${n}`);
  }
  if (notApproved.length) {
    console.log(`\n⚠️  NOT APPROVED (will fail at runtime):`);
    for (const { name, status } of notApproved) console.log(`    - ${name} [${status}]`);
  }
  if (extraInMeta.length) {
    console.log(`\n📋 Extra templates in Meta (not referenced in code):`);
    for (const n of extraInMeta) console.log(`    - ${n}`);
  }
  if (!missing.length && !notApproved.length) {
    console.log(`\n🎉 All ${CODE_TEMPLATES.length} code templates are approved in Meta BM!`);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});

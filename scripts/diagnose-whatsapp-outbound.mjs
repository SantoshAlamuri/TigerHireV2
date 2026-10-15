#!/usr/bin/env node
/**
 * Prints why TigerHire may not be calling Meta Graph for WhatsApp outbound,
 * without sending messages or printing full secrets.
 *
 * Usage:
 *   node --env-file=.env.local scripts/diagnose-whatsapp-outbound.mjs
 *   # or on Vercel: paste env into shell then run without --env-file
 */

function vercelEnv() {
  const v = process.env.VERCEL_ENV?.trim();
  if (v === "production" || v === "preview" || v === "development") return v;
  const node = process.env.NODE_ENV;
  if (node === "production") return "production";
  return "development";
}

function boolLabel(v) {
  return v ? "yes" : "no";
}

const envName = vercelEnv();
const whatsappMode = (process.env.WHATSAPP_MODE ?? "").toLowerCase();
const sandbox = whatsappMode === "sandbox";
const outboundEnabled = process.env.OUTBOUND_NOTIFICATIONS_ENABLED === "true";
const productionHold = envName === "production" && !outboundEnabled;

const phoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim();
const token = (process.env.WHATSAPP_ACCESS_TOKEN ?? "").trim();
const metaConfigured = Boolean(phoneId && token);

function mask(s) {
  if (!s) return "(empty)";
  if (s.length <= 8) return "***";
  return `${s.slice(0, 4)}…${s.slice(-4)} (${s.length} chars)`;
}

console.log("\n=== TigerHire WhatsApp outbound diagnosis ===\n");
console.log(`VERCEL_ENV:        ${process.env.VERCEL_ENV ?? "(unset)"}`);
console.log(`NODE_ENV:          ${process.env.NODE_ENV ?? "(unset)"}`);
console.log(`Resolved deploy:  ${envName}`);
console.log(`WHATSAPP_MODE:     ${whatsappMode || "(unset) — not sandbox"}`);
console.log(
  `WHATSAPP sandbox:  ${boolLabel(sandbox)}  → if yes, Meta API is NOT called (log-only).`,
);
console.log(`OUTBOUND_NOTIFICATIONS_ENABLED: ${outboundEnabled ? "true" : "false or unset"}`);
console.log(
  `Production hold:   ${boolLabel(productionHold)}  → if yes, production skips real WhatsApp sends until OUTBOUND_NOTIFICATIONS_ENABLED=true.`,
);
console.log(`WHATSAPP_PHONE_NUMBER_ID: ${phoneId ? mask(phoneId) : "(missing)"}`);
console.log(`WHATSAPP_ACCESS_TOKEN:    ${token ? mask(token) : "(missing)"}`);
console.log(
  `Meta send eligible:       ${boolLabel(metaConfigured && !sandbox && !productionHold)}`,
);

console.log("\n--- Likely blockers (fix in order) ---\n");

if (sandbox) {
  console.log(
    "1. WHATSAPP_MODE=sandbox — remove it or set to something other than 'sandbox' to allow real Graph sends.",
  );
}
if (productionHold) {
  console.log(
    "2. Vercel production without OUTBOUND_NOTIFICATIONS_ENABLED=true — set that env on Production in Vercel, redeploy.",
  );
}
if (!phoneId || !token) {
  console.log(
    "3. Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN — Meta → WhatsApp → API setup; token must be a valid System User / permanent token with whatsapp_business_messaging.",
  );
}

if (!sandbox && !productionHold && metaConfigured) {
  console.log(
    "No software gate detected. If messages still do not arrive:\n" +
      '  • Check Vercel/server logs for "Meta WhatsApp send failed" (template name, 24h window, invalid phone).\n' +
      "  • Session text messages need an open 24h customer window unless a template is used.\n" +
      "  • Templates must exist and be APPROVED in Meta Business Manager (names like th_job_match_result, tigerhire_session_expired).\n" +
      "  • Test numbers: add recipient as a test user in Meta app roles if using a development/test WABA.\n",
  );
}

console.log("Docs: docs/WHATSAPP_OUTBOUND_TROUBLESHOOTING.md\n");

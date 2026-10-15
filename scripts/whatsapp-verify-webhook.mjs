#!/usr/bin/env node
/**
 * Verifies the WhatsApp webhook GET handshake (Meta Cloud API hub verification).
 *
 * Query shape: hub.mode, hub.verify_token, hub.challenge (same as Meta sends).
 *
 * Usage:
 *   npm run whatsapp:verify-webhook
 *   node --env-file=.env.local scripts/whatsapp-verify-webhook.mjs --url https://your-domain.com
 *
 * Env (from .env.local or shell):
 *   WHATSAPP_WEBHOOK_SECRET — required; must match Meta app webhook verify token.
 *   NEXT_PUBLIC_APP_URL — default base URL (no trailing slash).
 *   WHATSAPP_VERIFY_BASE_URL — optional; overrides NEXT_PUBLIC_APP_URL for this check only.
 */

const args = process.argv.slice(2);
let baseOverride = process.env.WHATSAPP_VERIFY_BASE_URL?.trim() || "";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--url" && args[i + 1]) {
    baseOverride = args[i + 1].trim();
    i++;
  }
}

const secret = process.env.WHATSAPP_WEBHOOK_SECRET?.trim() || "";
const base =
  baseOverride || process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.VERCEL_URL?.trim();

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!secret) {
  fail(
    "Missing WHATSAPP_WEBHOOK_SECRET. Set it in .env.local (same value as Meta verify token) and run with:\n  node --env-file=.env.local scripts/whatsapp-verify-webhook.mjs",
  );
}

if (!base) {
  fail(
    "No base URL. Set NEXT_PUBLIC_APP_URL, or WHATSAPP_VERIFY_BASE_URL, or pass --url https://your-production-host",
  );
}

const normalized = base.replace(/\/$/, "");
const challenge = `tigerhire_verify_${Date.now()}`;
const path = "/api/webhooks/whatsapp";
const url = new URL(path, normalized.startsWith("http") ? normalized : `https://${normalized}`);
url.searchParams.set("hub.mode", "subscribe");
url.searchParams.set("hub.verify_token", secret);
url.searchParams.set("hub.challenge", challenge);

console.log("GET", url.toString().replace(secret, "***"));

const res = await fetch(url.toString(), { method: "GET" });
const text = await res.text();

if (res.status !== 200) {
  fail(
    `Expected HTTP 200, got ${res.status}.\nBody: ${text.slice(0, 500)}\n\nIf 403: Meta verify token must exactly match WHATSAPP_WEBHOOK_SECRET on this deployment.`,
  );
}

if (text.trim() !== challenge) {
  fail(
    `Expected response body to equal hub.challenge.\nExpected: ${challenge}\nGot: ${text.slice(0, 200)}`,
  );
}

console.log("OK — webhook verification handshake matches production (challenge echoed).");
console.log(
  "Next: In Meta Developer App → WhatsApp → Configuration, set callback URL to:",
  new URL(path, url.origin).toString(),
);
console.log("      Verify token = same value as WHATSAPP_WEBHOOK_SECRET.");
console.log(
  "      For inbound messages (POST): set WHATSAPP_META_APP_SECRET on the server to your Meta App Secret (Settings → Basic), or POSTs may return 401.",
);

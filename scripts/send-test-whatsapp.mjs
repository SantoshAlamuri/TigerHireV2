#!/usr/bin/env node
/**
 * One-off send: Meta WhatsApp template `th_application_received` (UTILITY; ok for first contact).
 *
 *   node --env-file=.env.local scripts/send-test-whatsapp.mjs [+E164] [templateName]
 *
 * Default phone: +919885674488. Default template: th_application_received
 * Second arg can override template name (must be approved in your WABA).
 *
 * Requires: WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN. Not WHATSAPP_MODE=sandbox.
 * Does not use Next/server-only code — safe to run from the repo root.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const GRAPH = "v22.0";
const DEFAULT_PHONE = "+919885674488";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  const raw = readFileSync(p, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvLocal();

function digitsOnly(phone) {
  return String(phone).replace(/\D/g, "");
}

async function main() {
  const toArg = (process.argv[2] ?? DEFAULT_PHONE).trim();
  const templateName = (process.argv[3] ?? "th_application_received").trim();

  const mode = (process.env.WHATSAPP_MODE ?? "").toLowerCase();
  if (mode === "sandbox") {
    console.error("WHATSAPP_MODE=sandbox — set to something other than sandbox for a real send.");
    process.exit(1);
  }

  const vercel = process.env.VERCEL_ENV;
  if (vercel === "production" && process.env.OUTBOUND_NOTIFICATIONS_ENABLED !== "true") {
    console.error(
      "Vercel production: set OUTBOUND_NOTIFICATIONS_ENABLED=true or sends are held in the app (this script still calls Meta if you run it with env).",
    );
  }

  const phoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim();
  const token = (process.env.WHATSAPP_ACCESS_TOKEN ?? "").trim();
  if (!phoneId || !token) {
    console.error("Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN.");
    process.exit(1);
  }

  const to = digitsOnly(toArg);
  if (to.length < 10) {
    console.error("Invalid phone. Use E.164 e.g. +919885674488");
    process.exit(1);
  }

  const endpoint = `https://graph.facebook.com/${GRAPH}/${phoneId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: "en" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: "Santosh" },
            { type: "text", text: "Test application" },
            { type: "text", text: "TigerHire" },
          ],
        },
      ],
    },
  };

  if (templateName !== "th_application_received") {
    console.warn("Using custom template — you may need to change body param count in this script.");
  }

  console.log(`POST ${templateName} → +${to}\n`);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    console.error("Meta error:", res.status, JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log("OK:", JSON.stringify(data, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

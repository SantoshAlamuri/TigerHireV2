#!/usr/bin/env node
/**
 * Read-only check: token + phone + WABA on Meta Graph API.
 * Does not send WhatsApp messages.
 *
 * Usage (pick one):
 *   node --env-file=.env.local scripts/verify-whatsapp-waba.mjs
 *   # or after exporting env from Vercel:
 *   node scripts/verify-whatsapp-waba.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const GRAPH = process.env.WHATSAPP_GRAPH_VERSION ?? "v22.0";

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

const token = (process.env.WHATSAPP_ACCESS_TOKEN ?? "").trim();
const phoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim();
const wabaIdEnv = (process.env.WHATSAPP_WABA_ID ?? "").trim();

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

async function graphGet(path) {
  const url = `https://graph.facebook.com/${GRAPH}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  console.log("\n=== WhatsApp / WABA check (Graph API) ===\n");

  if (!token) {
    fail("Set WHATSAPP_ACCESS_TOKEN (e.g. from Vercel or .env.local) and run again.");
  }
  if (!phoneId) {
    fail("Set WHATSAPP_PHONE_NUMBER_ID and run again.");
  }

  console.log(
    "1. Phone number (WHATSAPP_PHONE_NUMBER_ID) — must be **Phone number ID** from API Setup, not WABA id…",
  );
  // Do not request `whatsapp_business_account{...}` on the phone object — not all API versions return it; use WABA list instead.
  const phone = await graphGet(`/${phoneId}?fields=id,display_phone_number,verified_name,status`);
  if (!phone.ok) {
    console.log(`   HTTP ${phone.status}:`, JSON.stringify(phone.data, null, 2));
    console.log(
      "   Hint: If you see 'Unsupported get request' or 404, the id may be wrong — copy **Phone number ID** from developers.facebook.com → App → WhatsApp → API setup.",
    );
    fail(
      "Token cannot read this phone number id — check id, token scopes, and that the token is for this app/WABA.",
    );
  }

  const p = phone.data;
  console.log(`   OK — id: ${p.id}`);
  console.log(`   OK — display: ${p.display_phone_number ?? "(n/a)"}`);
  console.log(`   OK — verified name: ${p.verified_name ?? "(n/a)"}`);
  if (p.status) console.log(`   OK — status: ${p.status}`);

  let waba = wabaIdEnv || null;

  if (waba) {
    const wabaRes = await graphGet(`/${waba}?fields=id,name`);
    if (wabaRes.ok) {
      console.log(
        `\n   OK — WHATSAPP_WABA_ID: ${wabaRes.data.id} — name: ${wabaRes.data.name ?? "(n/a)"}`,
      );
    } else {
      console.log(`\n   ⚠ WHATSAPP_WABA_ID lookup failed:`, JSON.stringify(wabaRes.data, null, 2));
    }
  }

  console.log("\n   Verifying this phone is listed under the WABA…");
  if (!waba) {
    const wabaFromEdge = await graphGet(`/${phoneId}?fields=whatsapp_business_account`);
    if (wabaFromEdge.ok && wabaFromEdge.data.whatsapp_business_account?.id) {
      waba = wabaFromEdge.data.whatsapp_business_account.id;
      console.log(`   OK — derived WABA id: ${waba}`);
    } else {
      console.log(
        "   ⚠ Set WHATSAPP_WABA_ID in Vercel (from WhatsApp Manager) so we can list phone_numbers + templates, or add whatsapp_business_management to the token.",
      );
    }
  }

  if (waba) {
    const phones = await graphGet(`/${waba}/phone_numbers?fields=id&limit=50`);
    if (phones.ok) {
      const ids = (phones.data.data ?? []).map((x) => x.id);
      const inList = ids.includes(phoneId) || ids.includes(String(phoneId));
      if (inList) {
        console.log(`   OK — phone id is in WABA’s phone_numbers list.`);
      } else {
        console.log(
          `   ⚠ Phone id ${phoneId} not in first page of WABA phone_numbers. Check you did not mix test vs prod numbers.`,
        );
        console.log(
          `   Known ids (sample): ${ids.slice(0, 5).join(", ")}${ids.length > 5 ? "…" : ""}`,
        );
      }
    } else {
      console.log(
        `   ⚠ Could not list WABA phone_numbers:`,
        JSON.stringify(phones.data, null, 2).slice(0, 300),
      );
    }
  }

  if (wabaIdEnv && waba && wabaIdEnv !== waba) {
    console.log(
      `\n   ⚠ WHATSAPP_WABA_ID env (${wabaIdEnv}) differs from derived WABA (${waba}). Align to one.`,
    );
  }
  if (!waba) {
    console.log("\n   ⚠ Could not determine WABA id; skipping template list.");
  } else {
    console.log("\n2. Message templates on WABA (first page)…");
    const tpl = await graphGet(`/${waba}/message_templates?fields=name,status&limit=10`);
    if (!tpl.ok) {
      console.log(`   HTTP ${tpl.status}:`, JSON.stringify(tpl.data, null, 2));
      console.log(
        "   ⚠ Could not list templates — token may need whatsapp_business_management (or templates not accessible yet).",
      );
    } else {
      const list = tpl.data.data ?? [];
      const paging = tpl.data.paging ? " (more on next page)" : "";
      console.log(`   OK — fetched ${list.length} template(s) in sample page${paging}.`);
      if (list.length) {
        for (const t of list.slice(0, 5)) {
          console.log(`        • ${t.name} — ${t.status ?? "?"}`);
        }
        if (list.length > 5) console.log("        …");
      }
    }
  }

  console.log("\n✓ Graph API token + phone number look usable for this WABA.\n");
  console.log(
    "Next: webhook (GET verify + POST) on your deployed host, and OUTBOUND_NOTIFICATIONS_ENABLED on production if sends are log-only.\n",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

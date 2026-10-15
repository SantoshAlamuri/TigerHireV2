#!/usr/bin/env node
/**
 * Send referral + consent templates to a phone (cold-outreach path) — verifies Meta accepts them.
 *
 *   node --env-file=.env.local scripts/test-referral-outbound-phone.mjs 9010255055
 *
 * Requires WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN. Not WHATSAPP_MODE=sandbox.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const GRAPH = "v22.0";
const LANGS = ["en", "en_US"];

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
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

function normalizeIndian(raw) {
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
  if (digits.length === 12 && /^91[6-9]\d{9}$/.test(digits)) return digits;
  return digits;
}

async function sendTemplate({ phoneId, token, to, name, lang, bodyParams }) {
  const endpoint = `https://graph.facebook.com/${GRAPH}/${phoneId}/messages`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name,
        language: { code: lang },
        components: [
          {
            type: "body",
            parameters: bodyParams.map((text) => ({ type: "text", text })),
          },
        ],
      },
    }),
  });
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    /* */
  }
  return { ok: res.ok, status: res.status, data, text };
}

async function tryTemplates({ phoneId, token, to, names, bodyParams, label }) {
  console.log(`\n--- ${label} ---`);
  for (const name of names) {
    for (const lang of LANGS) {
      const r = await sendTemplate({ phoneId, token, to, name, lang, bodyParams });
      const wamid = r.data?.messages?.[0]?.id;
      const err = r.data?.error?.message ?? r.text?.slice(0, 200);
      console.log(`${r.ok ? "OK" : "FAIL"} ${name} (${lang}) → ${wamid ?? err}`);
      if (r.ok) return true;
    }
  }
  return false;
}

async function main() {
  const raw = (process.argv[2] ?? "").trim();
  if (!raw) {
    console.error("Usage: node scripts/test-referral-outbound-phone.mjs <10-digit-mobile>");
    process.exit(1);
  }
  const to = normalizeIndian(raw);
  if (!/^91[6-9]\d{9}$/.test(to)) {
    console.error(`Invalid Indian mobile after normalize: ${to}`);
    process.exit(1);
  }

  const phoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim();
  const token = (process.env.WHATSAPP_ACCESS_TOKEN ?? "").trim();
  if (!phoneId || !token) {
    console.error("Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN");
    process.exit(1);
  }

  console.log(`Target: ${to} (from ${raw})`);

  const utilityOk = await tryTemplates({
    phoneId,
    token,
    to,
    names: ["th_application_received"],
    bodyParams: ["Test Candidate", "referral from Santosh", "TigerHire"],
    label: "UTILITY first contact (th_application_received)",
  });

  const referralOk = await tryTemplates({
    phoneId,
    token,
    to,
    names: ["tigerhire_referral_v1", "tigerhire_referral_v2"],
    bodyParams: ["Test Candidate", "Santosh"],
    label: "MARKETING referral (often accepted but not delivered cold)",
  });

  const consentOk = await tryTemplates({
    phoneId,
    token,
    to,
    names: ["tigerhire_consent_v2", "tigerhire_consent_v1"],
    bodyParams: ["You were referred by someone who trusts your work."],
    label: "Consent",
  });

  if (!utilityOk && !referralOk && !consentOk) {
    console.error(
      "\nNo template succeeded. In Meta Business Manager → WhatsApp → Message templates, approve th_application_received (UTILITY) and referral/consent templates.",
    );
    process.exit(1);
  }
  console.log(
    "\nMeta API accepted at least one send. If only MARKETING templates succeeded but the phone is empty,",
  );
  console.log(
    "that is expected: cold numbers need UTILITY (th_application_received) or the user must message +91 98804 44688 first.",
  );
  console.log("Check the phone — UTILITY message should be the one that actually arrives.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

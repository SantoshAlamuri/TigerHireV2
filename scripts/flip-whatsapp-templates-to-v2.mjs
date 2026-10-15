#!/usr/bin/env node
/**
 * After Meta approves the v2 WhatsApp templates submitted by
 * `scripts/submit-whatsapp-templates-v2.mjs`, run this to flip the
 * remaining v1 references in the codebase to their v2 counterparts.
 *
 * Usage:
 *   node --env-file=.env.local scripts/flip-whatsapp-templates-to-v2.mjs --check
 *   node --env-file=.env.local scripts/flip-whatsapp-templates-to-v2.mjs --apply
 *
 * `--check` first verifies each v2 is APPROVED on Meta. `--apply` rewrites
 * the source files in place. Commit the diff, redeploy.
 *
 * Consent + FitScore are already on v2 (they had no v1 on Meta); those are
 * not touched here.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const GRAPH = "v22.0";
const token = (process.env.WHATSAPP_ACCESS_TOKEN ?? "").trim();
const waba = (process.env.WHATSAPP_WABA_ID ?? "").trim();

const args = process.argv.slice(2);
const check = args.includes("--check");
const apply = args.includes("--apply");

if (!check && !apply) {
  console.error("Pass --check (dry run) or --apply (rewrite files).");
  process.exit(1);
}
if (!token || !waba) {
  console.error("Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_WABA_ID.");
  process.exit(1);
}

/**
 * Each entry: { from: v1 name, to: v2 name, paths: files where the name appears verbatim }
 * Keep `from` strings quoted and unambiguous so the replace is safe.
 */
const FLIPS = [
  {
    from: '"th_job_no_match"',
    to: '"th_job_no_match_v2"',
    paths: ["src/lib/services/whatsapp.ts", "src/lib/whatsapp/templates.ts"],
  },
  {
    from: '"th_no_match_subscribed"',
    to: '"th_no_match_subscribed_v2"',
    paths: ["src/lib/services/whatsapp.ts", "src/lib/whatsapp/templates.ts"],
  },
  {
    from: '"th_reengagement"',
    to: '"th_reengagement_v2"',
    paths: ["src/lib/services/whatsapp.ts"],
  },
  {
    from: '"th_post_hire_pulse"',
    to: '"th_post_hire_pulse_v2"',
    paths: ["src/lib/services/whatsapp.ts"],
  },
  {
    from: '"tigerhire_session_expired"',
    to: '"tigerhire_session_expired_v2"',
    paths: ["src/lib/services/whatsapp.ts"],
  },
  {
    from: '"th_referrer_offer_update"',
    to: '"th_referrer_offer_update_v2"',
    paths: ["src/lib/whatsapp/referrer-notifications.ts"],
  },
  {
    from: '"th_referrer_rejection_update"',
    to: '"th_referrer_rejection_update_v2"',
    paths: ["src/lib/whatsapp/referrer-notifications.ts"],
  },
  {
    from: '"tigerhire_referral_v1"',
    to: '"tigerhire_referral_v2"',
    paths: ["src/lib/whatsapp/templates.ts"],
  },
  {
    from: '"tigerhire_employee_invite_v1"',
    to: '"tigerhire_employee_invite_v2"',
    paths: ["src/lib/whatsapp/templates.ts"],
  },
];

async function templateStatus(name) {
  const url = `https://graph.facebook.com/${GRAPH}/${waba}/message_templates?fields=name,status&name=${name}&limit=5`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) return { ok: false, status: res.status, error: data };
  const match = (data.data ?? []).find((t) => t.name === name);
  return { ok: true, found: !!match, status: match?.status ?? null };
}

async function main() {
  console.log(
    `\n=== Flip remaining v1 WhatsApp template refs (${apply ? "APPLY" : "CHECK"}) ===\n`,
  );

  const blockers = [];
  for (const flip of FLIPS) {
    const v2name = flip.to.replace(/"/g, "");
    const s = await templateStatus(v2name);
    const label = `${v2name.padEnd(40)}`;
    if (!s.ok) {
      console.log(`  ? ${label} — HTTP error: ${JSON.stringify(s.error).slice(0, 120)}`);
      blockers.push(v2name);
      continue;
    }
    if (!s.found) {
      console.log(`  ✖ ${label} — NOT FOUND on WABA. Run submit-whatsapp-templates-v2.mjs first.`);
      blockers.push(v2name);
      continue;
    }
    if (s.status !== "APPROVED") {
      console.log(`  ⏳ ${label} — ${s.status} (wait for APPROVED)`);
      blockers.push(v2name);
      continue;
    }
    console.log(`  ✓ ${label} — APPROVED`);
  }

  if (blockers.length) {
    console.log(`\n${blockers.length} template(s) not ready. Fix above, then retry.\n`);
    process.exit(check ? 0 : 1);
  }

  if (check) {
    console.log("\nAll v2 templates are APPROVED. Re-run with --apply to rewrite files.\n");
    return;
  }

  console.log("\n=== Rewriting files ===");
  const touched = new Set();
  for (const flip of FLIPS) {
    for (const rel of flip.paths) {
      const abs = resolve(process.cwd(), rel);
      const before = readFileSync(abs, "utf8");
      if (!before.includes(flip.from)) {
        console.log(`  ⊘ ${rel}  (no occurrence of ${flip.from}; skipping)`);
        continue;
      }
      const after = before.split(flip.from).join(flip.to);
      writeFileSync(abs, after);
      console.log(`  ✓ ${rel}  (${flip.from} → ${flip.to})`);
      touched.add(rel);
    }
  }
  console.log(`\nRewrote ${touched.size} file(s). Commit the diff, push, redeploy.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

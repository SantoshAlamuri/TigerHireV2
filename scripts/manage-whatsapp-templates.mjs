#!/usr/bin/env node
/**
 * Audit, submit, and resubmit WhatsApp message templates on the connected WABA.
 *
 * Usage:
 *   node --env-file=.env.local scripts/manage-whatsapp-templates.mjs audit
 *   node --env-file=.env.local scripts/manage-whatsapp-templates.mjs submit --only tigerhire_referred_candidate_v1
 *   node --env-file=.env.local scripts/manage-whatsapp-templates.mjs resubmit-fixups
 *   node --env-file=.env.local scripts/manage-whatsapp-templates.mjs resubmit-fixups --dry-run
 *
 * Meta best practices (UTILITY cold outreach):
 *   - Transactional copy; avoid promotional hooks (FitScore hype, bonuses).
 *   - Never put a bare URL in a body {{n}} slot — use a URL BUTTON with dynamic suffix.
 *   - Every {{n}} needs example values; variables cannot be first/last token in body.
 *   - Rejected names cannot be edited — submit a new name (e.g. *_v6) and point code at fallbacks.
 *
 * Webhook: subscribe to `message_template_status_update` on the WhatsApp app so
 *   POST /api/webhooks/whatsapp logs APPROVED/REJECTED events (see parse-template-status-webhook.ts).
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const GRAPH = process.env.WHATSAPP_GRAPH_VERSION ?? "v22.0";
const token = (process.env.WHATSAPP_ACCESS_TOKEN ?? "").trim();
const waba = (process.env.WHATSAPP_WABA_ID ?? "").trim();

const __dir = dirname(fileURLToPath(import.meta.url));

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

if (!token) fail("Missing WHATSAPP_ACCESS_TOKEN");
if (!waba) fail("Missing WHATSAPP_WABA_ID");

/** Fixed bodies for templates that were REJECTED with INVALID_FORMAT on this WABA. */
const FIXUP_SUBMISSIONS = [
  {
    name: "th_job_match_result_v6",
    category: "UTILITY",
    language: "en",
    note: "Lane A FitScore — 5 body vars, text after {{5}}",
    components: [
      {
        type: "BODY",
        text: "Hi {{1}}, we scored your profile against a role on TigerHire. The position is {{2}} based in {{3}}. Your FitScore for this match is {{4}} out of 100. Our quick summary for you: {{5}}. Reply here if you want to discuss next steps or have questions for our team.",
        example: {
          body_text: [
            [
              "Rahul",
              "Backend Engineer",
              "Bengaluru",
              "82",
              "Strong fit — your stack aligns with the role.",
            ],
          ],
        },
      },
    ],
  },
  {
    name: "screening_questions_v6",
    category: "UTILITY",
    language: "en",
    note: "Screening link — URL in BUTTON, not body {{n}}",
    components: [
      {
        type: "BODY",
        text: "Hi {{1}}, please complete your screening questions for {{2}} on TigerHire. Tap the button below to open the form. We will message you here when it is done.",
        example: { body_text: [["Priya", "Backend Engineer"]] },
      },
      {
        type: "BUTTONS",
        buttons: [
          {
            type: "URL",
            text: "Open screening",
            url: "https://tigerhire.io/{{1}}",
            example: ["apply/screen/abc123"],
          },
        ],
      },
    ],
  },
];

async function listAllTemplates() {
  const templates = [];
  let url = `https://graph.facebook.com/${GRAPH}/${waba}/message_templates?fields=name,status,category,rejected_reason,language&limit=100`;

  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(`List failed: ${JSON.stringify(data)}`);
    if (data.data?.length) templates.push(...data.data);
    url = data.paging?.next ?? null;
  }
  return templates;
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

async function audit() {
  const all = await listAllTemplates();
  const byStatus = Object.groupBy(all, (t) => t.status);

  console.log(`\n=== WABA ${waba}: ${all.length} templates ===\n`);

  for (const status of ["REJECTED", "PENDING", "APPROVED", "PAUSED", "DISABLED"]) {
    const group = byStatus[status];
    if (!group?.length) continue;
    console.log(`--- ${status} (${group.length}) ---`);
    for (const t of group.sort((a, b) => a.name.localeCompare(b.name))) {
      const reason =
        t.rejected_reason && t.rejected_reason !== "NONE" ? ` (${t.rejected_reason})` : "";
      console.log(`  ${t.name}  [${t.category}]  ${t.language ?? "en"}${reason}`);
    }
    console.log();
  }

  const referral = [
    "tigerhire_referred_candidate_v1",
    "tigerhire_referral_v1",
    "tigerhire_consent_v2",
    "th_application_received",
  ];
  console.log("--- Referral / consent (cold outreach) ---");
  for (const name of referral) {
    const hits = all.filter((t) => t.name === name);
    if (!hits.length) console.log(`  ? ${name} — NOT ON WABA`);
    else
      for (const t of hits)
        console.log(`  ${t.status === "APPROVED" ? "✓" : "…"} ${name}  ${t.status}  ${t.category}`);
  }

  console.log("\nTip: resubmit INVALID_FORMAT fixups with:");
  console.log(
    "  node --env-file=.env.local scripts/manage-whatsapp-templates.mjs resubmit-fixups\n",
  );
}

async function resubmitFixups(dryRun) {
  const all = await listAllTemplates();
  const nameSet = new Set(all.map((t) => t.name));

  console.log(
    `\n=== Resubmit fixups (${FIXUP_SUBMISSIONS.length})${dryRun ? " DRY RUN" : ""} ===\n`,
  );

  for (const tpl of FIXUP_SUBMISSIONS) {
    const existing = all.filter((t) => t.name === tpl.name);
    const approved = existing.some((t) => t.status === "APPROVED");
    const pending = existing.some((t) => t.status === "PENDING");

    console.log(`→ ${tpl.name} — ${tpl.note}`);
    if (approved) {
      console.log("  ⊘ already APPROVED — skip");
      continue;
    }
    if (pending) {
      console.log("  ⊘ already PENDING — skip");
      continue;
    }
    if (nameSet.has(tpl.name) && existing.some((t) => t.status === "REJECTED")) {
      console.log(
        "  ⚠ rejected copy blocks reuse — submit uses new name; delete in Meta BM if needed",
      );
    }

    if (dryRun) {
      console.log("  (dry-run — skipped POST)");
      continue;
    }

    const { name, category, language, components } = tpl;
    const r = await submitTemplate({ name, category, language, components });
    if (r.ok) {
      console.log(`  ✓ ${r.data.status ?? "SUBMITTED"} — id ${r.data.id ?? "(n/a)"}`);
    } else {
      const msg = r.data?.error?.message ?? JSON.stringify(r.data);
      const sub = r.data?.error?.error_subcode;
      if (sub === 2388024 || /already exists/i.test(String(msg))) {
        console.log(`  ⊘ already exists on WABA`);
      } else {
        console.log(`  ✖ ${msg}`);
      }
    }
  }
  console.log();
}

function runSubmitScript(only, dryRun) {
  const script = join(__dir, "submit-whatsapp-templates-v2.mjs");
  const args = ["--env-file=.env.local", script];
  if (only) args.push("--only", only);
  if (dryRun) args.push("--dry-run");
  const r = spawnSync("node", args, { stdio: "inherit", cwd: join(__dir, "..") });
  process.exit(r.status ?? 1);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const dryRun = rest.includes("--dry-run");
  const onlyIdx = rest.indexOf("--only");
  const only = onlyIdx >= 0 ? rest[onlyIdx + 1] : null;

  switch (cmd) {
    case "audit":
      await audit();
      break;
    case "resubmit-fixups":
      await resubmitFixups(dryRun);
      break;
    case "submit":
      runSubmitScript(only, dryRun);
      break;
    default:
      console.log(`Usage:
  audit              List REJECTED / PENDING / APPROVED templates
  submit [--only X]  Delegate to submit-whatsapp-templates-v2.mjs
  resubmit-fixups    POST v6 fixups for INVALID_FORMAT rejections
`);
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

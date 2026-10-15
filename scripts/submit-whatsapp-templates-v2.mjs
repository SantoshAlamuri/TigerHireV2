#!/usr/bin/env node
/**
 * Submits v2 WhatsApp templates to Meta for approval.
 *
 * Usage:
 *   node --env-file=.env.local scripts/submit-whatsapp-templates-v2.mjs
 *   node --env-file=.env.local scripts/submit-whatsapp-templates-v2.mjs --only tigerhire_consent_v2
 *   node --env-file=.env.local scripts/submit-whatsapp-templates-v2.mjs --dry-run
 *
 * Env:
 *   WHATSAPP_ACCESS_TOKEN  — System User token with whatsapp_business_management scope
 *   WHATSAPP_WABA_ID       — WhatsApp Business Account id
 *
 * Notes:
 *   - Templates go into PENDING review; Meta typically approves in 1-3 hours.
 *   - If a name already exists (APPROVED or PENDING), Meta returns code 192/2388024;
 *     this script reports "already exists" and continues.
 *   - Only edit TEMPLATES[] below when adding/rewriting copy. Language stays "en".
 */

const GRAPH = "v22.0";
const token = (process.env.WHATSAPP_ACCESS_TOKEN ?? "").trim();
const waba = (process.env.WHATSAPP_WABA_ID ?? "").trim();

if (!token) fail("Missing WHATSAPP_ACCESS_TOKEN");
if (!waba) fail("Missing WHATSAPP_WABA_ID");

const args = process.argv.slice(2);
const onlyIdx = args.indexOf("--only");
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
const dryRun = args.includes("--dry-run");

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

/**
 * Template definitions.
 * category: UTILITY (transactional/service) | MARKETING (promotional) | AUTHENTICATION (OTP)
 * body text: use {{1}}, {{2}}, ... for parameter slots (kept in same order as callers pass them).
 */
const TEMPLATES = [
  // --- Plan pilot (Phase 0): screening invite on pipeline move to phone_screen ---
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
  // --- Wave 1: critical (missing or broken) ---
  {
    name: "tigerhire_consent_v2",
    category: "MARKETING",
    language: "en",
    components: [
      {
        type: "BODY",
        text: "Hi! I'm TigerHire — I match your CV against live roles in minutes. I need a quick consent first so I can process your CV and share matches on WhatsApp. {{1}} Reply YES to continue or NO to opt out. Privacy: https://tigerhire.io/privacy",
        example: {
          body_text: [["You've been referred by someone who trusts your work."]],
        },
      },
    ],
  },
  {
    name: "tigerhire_consent_v3_with_bonus",
    category: "UTILITY",
    language: "en",
    components: [
      {
        type: "BODY",
        text: "Hi {{1}}, I'm TigerHire — I match your CV against live roles in minutes. {{3}} referred you to a role at {{2}}. I need a quick consent first so I can process your CV and share matches on WhatsApp. If you join, you'll receive a ₹{{4}} joining bonus from {{2}}. Reply YES to continue or NO to opt out. Privacy: https://tigerhire.io/privacy",
        example: {
          body_text: [["Priya", "Acme Corp", "Kiran Mehta", "25000"]],
        },
      },
    ],
  },
  {
    name: "th_referral_drive_multi",
    category: "MARKETING",
    language: "en",
    components: [
      {
        type: "BODY",
        text: "Hi {{1}}, {{2}} has multiple open roles on TigerHire: {{3}}. View all roles and refer candidates: {{4}} Thank you for spreading the word on TigerHire.",
        example: {
          body_text: [
            [
              "Kiran",
              "Acme Corp",
              "Backend Engineer, Data Engineer, and more",
              "tigerhire.io/refer/campaign/abc123",
            ],
          ],
        },
      },
    ],
  },
  {
    name: "th_referral_drive_urgent",
    category: "MARKETING",
    language: "en",
    components: [
      {
        type: "BODY",
        text: "Hi {{1}}, urgent hire at {{2}}: {{3}}. Multiple roles are open — refer great candidates: {{4}} Thank you for helping on TigerHire.",
        example: {
          body_text: [
            [
              "Kiran",
              "Acme Corp",
              "Backend Engineer and other roles",
              "tigerhire.io/refer/campaign/abc123",
            ],
          ],
        },
      },
    ],
  },
  {
    name: "tigerhire_fitscore_v2",
    category: "UTILITY",
    language: "en",
    components: [
      {
        type: "BODY",
        text: "Hi {{1}}, here's your FitScore from TigerHire — you matched {{2}} of {{3}} live roles. Top match: {{4}} at {{5}} ({{6}}/100). Reply to explore more matches.",
        example: {
          body_text: [["Priya", "4", "120", "Senior Backend Engineer", "Acme Corp", "87"]],
        },
      },
    ],
  },
  {
    name: "tigerhire_session_expired_v2",
    category: "MARKETING",
    language: "en",
    components: [
      {
        type: "BODY",
        text: "Hi from TigerHire — we paused the thread on {{1}}. Reply here if you'd like to pick it back up and continue where we left off.",
        example: {
          body_text: [["your job search"]],
        },
      },
    ],
  },

  // --- INVALID_FORMAT fixups (new names; old names stay REJECTED on WABA) ---
  {
    name: "th_job_match_result_v6",
    category: "UTILITY",
    language: "en",
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

  // --- UTILITY cold referral (delivers where MARKETING referral templates do not) ---
  {
    name: "tigerhire_referred_candidate_v1",
    category: "UTILITY",
    language: "en",
    components: [
      {
        type: "BODY",
        text: "Hi {{1}}, {{2}} referred you on TigerHire. Reply YES to continue, or send your CV as a PDF and we will share your FitScore against live roles in about 2 minutes. Privacy: https://tigerhire.io/privacy",
        example: { body_text: [["Navya", "Santosh"]] },
      },
    ],
  },

  // --- Wave 2: copy improvements (replaces v1 with better wording) ---
  {
    name: "tigerhire_referral_v2",
    category: "MARKETING",
    language: "en",
    components: [
      {
        type: "BODY",
        text: "Hi {{1}}, {{2}} referred you to a role on TigerHire. Send your CV as a PDF to see your FitScore in 2 minutes, or reply YES to learn more first.",
        example: { body_text: [["Priya", "Rahul"]] },
      },
    ],
  },
  {
    name: "th_referrer_rejection_update_v2",
    category: "UTILITY",
    language: "en",
    components: [
      {
        type: "BODY",
        text: "Hi — quick update on your referral: {{1}} wasn't chosen for {{2}} this time. Thanks for backing them; we'll keep matching them to better-fit roles.",
        example: { body_text: [["Priya", "Senior Backend Engineer"]] },
      },
    ],
  },
  {
    name: "th_referrer_offer_update_v2",
    category: "UTILITY",
    language: "en",
    components: [
      {
        type: "BODY",
        text: "Great news — {{1}} got an offer for {{2}} at {{3}}! Your referral bonus of {{4}} is being processed and we'll confirm once it's cleared.",
        example: {
          body_text: [["Priya", "Senior Backend Engineer", "Acme Corp", "INR 50,000"]],
        },
      },
    ],
  },
  {
    name: "th_job_no_match_v2",
    category: "UTILITY",
    language: "en",
    components: [
      {
        type: "BODY",
        text: "Hi {{1}}, thanks for sharing your CV. {{2}} isn't a strong fit today, but your profile is active — I'll ping you as soon as a better-fit role opens up.",
        example: { body_text: [["Priya", "Senior Backend Engineer"]] },
      },
    ],
  },
  {
    name: "th_no_match_subscribed_v2",
    category: "MARKETING",
    language: "en",
    components: [
      {
        type: "BODY",
        text: "Hi {{1}}! No great fit for {{2}} in {{3}} yet — I've added you to alerts and will message you the moment a stronger match goes live.",
        example: { body_text: [["Priya", "Backend Engineer", "Bangalore"]] },
      },
    ],
  },
  {
    name: "th_reengagement_v2",
    category: "MARKETING",
    language: "en",
    components: [
      {
        type: "BODY",
        text: "Hi {{1}}, {{2}} new role(s) have been posted since you last checked. Reply to see them, or send an updated CV to refresh your FitScore.",
        example: { body_text: [["Priya", "12"]] },
      },
    ],
  },
  {
    name: "th_post_hire_pulse_v2",
    category: "UTILITY",
    language: "en",
    components: [
      {
        type: "BODY",
        text: "Hi {{1}}, checking in on {{2}} in the {{3}} role — how are things going? ({{4}} check-in.) Reply with a quick note and we'll route it to the team.",
        example: {
          body_text: [["Rahul", "Priya", "Senior Backend Engineer", "30-day"]],
        },
      },
    ],
  },
  {
    name: "tigerhire_employee_invite_v2",
    category: "MARKETING",
    language: "en",
    components: [
      {
        type: "BODY",
        text: "Hi {{1}}! {{2}} invited you to join the {{3}} team on TigerHire. Tap the invite in your email to accept, or reply here if you need help.",
        example: { body_text: [["Priya", "Rahul", "Engineering"]] },
      },
    ],
  },
];

async function submit(template) {
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

async function main() {
  const list = only ? TEMPLATES.filter((t) => t.name === only) : TEMPLATES;
  if (only && list.length === 0) fail(`Template ${only} not found in script definitions.`);

  console.log(
    `\n=== Submitting ${list.length} template(s) to WABA ${waba}${dryRun ? " (DRY RUN)" : ""} ===\n`,
  );

  const results = { created: [], pending: [], existing: [], failed: [] };

  for (const tpl of list) {
    console.log(`→ ${tpl.name} [${tpl.category}]`);
    if (dryRun) {
      console.log(`  (dry-run — skipped)`);
      continue;
    }
    const r = await submit(tpl);
    if (r.ok) {
      const status = r.data.status ?? "SUBMITTED";
      console.log(`  ✓ ${status} — id ${r.data.id ?? "(n/a)"}`);
      if (status === "APPROVED") results.created.push(tpl.name);
      else results.pending.push(tpl.name);
    } else {
      const code = r.data?.error?.code;
      const sub = r.data?.error?.error_subcode;
      const msg = r.data?.error?.message ?? "(no message)";
      // 192/2388024 = already exists (per Meta error codes)
      if (code === 192 || sub === 2388024 || /already exists/i.test(msg)) {
        console.log(`  ⊘ already exists on WABA — skipping`);
        results.existing.push(tpl.name);
      } else {
        console.log(`  ✖ HTTP ${r.status}: ${msg} (code ${code}${sub ? `, sub ${sub}` : ""})`);
        results.failed.push({ name: tpl.name, message: msg });
      }
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Submitted (PENDING review): ${results.pending.length}`);
  if (results.pending.length) console.log(`  ${results.pending.join(", ")}`);
  console.log(`Already existed (skipped):  ${results.existing.length}`);
  if (results.existing.length) console.log(`  ${results.existing.join(", ")}`);
  console.log(`Auto-approved:              ${results.created.length}`);
  if (results.created.length) console.log(`  ${results.created.join(", ")}`);
  console.log(`Failed:                     ${results.failed.length}`);
  if (results.failed.length) {
    for (const f of results.failed) console.log(`  ✖ ${f.name}: ${f.message}`);
  }

  console.log("\nNext: wait for Meta to review (1-3 hours typical). Check status with:");
  console.log("  node --env-file=.env.local scripts/verify-whatsapp-waba.mjs\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

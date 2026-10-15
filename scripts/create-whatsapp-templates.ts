/**
 * Create WhatsApp message templates for TigerHire via Meta Message Templates API.
 * POST /{WABA_ID}/message_templates
 *
 * Covers template names used by src/lib/services/whatsapp.ts, src/lib/whatsapp/templates.ts,
 * and referrer flow (see docs/WHATSAPP_RESPONSE_TEMPLATES.md for copy alignment).
 *
 * th_referrer_otp: AUTHENTICATION (Meta OTP layout) or UTILITY — see TH_REFERRER_OTP_TEMPLATE_CATEGORY.
 *
 * Usage: npm run create:templates  (expects .env.local: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID; optional WHATSAPP_WABA_ID, WHATSAPP_GRAPH_VERSION)
 *
 * Meta approves each template after submission; creation returns PENDING until approved in Business Manager.
 */

import * as readline from "readline/promises";

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION ?? "v22.0";

type Category = "UTILITY" | "MARKETING" | "AUTHENTICATION";

type TemplateRow = {
  name: string;
  category: Category;
  language: string;
  /** BODY text with {{1}}..{{n}} */
  text: string;
  /** One sample row for each {{n}} in order */
  examples: string[];
};

type MetaOtpButton = { type: "OTP"; otp_type: "COPY_CODE" };
type MetaBodyComponent = {
  type: "BODY";
  text?: string;
  add_security_recommendation?: boolean;
  example?: { body_text: string[][] };
};

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function resolveWabaId(phoneNumberId: string, token: string): Promise<string> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}`);
  url.searchParams.set("fields", "whatsapp_business_account{id}");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = (await readJson(res)) as {
    whatsapp_business_account?: { id?: string };
  };
  if (!res.ok) {
    throw new Error(`WABA lookup failed: ${res.status} ${JSON.stringify(data)}`);
  }
  const id = data.whatsapp_business_account?.id;
  if (!id) throw new Error(`No whatsapp_business_account on phone number id ${phoneNumberId}`);
  return id;
}

async function metaCreateTemplate(
  wabaId: string,
  token: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/message_templates`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const data = await readJson(res);
  return { ok: res.ok, status: res.status, data };
}

function isAlreadyExists(data: unknown): boolean {
  const s = JSON.stringify(data).toLowerCase();
  return s.includes("already") && s.includes("exist");
}

function rowToPayload(row: TemplateRow): Record<string, unknown> {
  return {
    name: row.name,
    language: row.language,
    category: row.category,
    components: [
      {
        type: "BODY",
        text: row.text,
        example: { body_text: [row.examples] },
      },
    ],
  };
}

/** Bodies from docs/WHATSAPP_RESPONSE_TEMPLATES.md and variable order from code */
const TEMPLATE_ROWS: readonly TemplateRow[] = [
  {
    name: "tigerhire_session_expired",
    category: "UTILITY",
    language: "en",
    text: "Hey Hi, I am from TigerHire: {{1}}. Are we still connected",
    examples: [
      "Thanks for the update — we sent your last message in this thread and want to continue helping with jobs.",
    ],
  },
  {
    name: "candidate_match_alert",
    category: "MARKETING",
    language: "en",
    text: "Hi {{1}}, great news! {{2}} role(s) on TigerHire match your profile. Top match: {{3}} in {{4}}. Reply to this chat to apply or learn more.",
    examples: ["Rahul", "3", "Backend Engineer at Acme", "Bengaluru"],
  },
  {
    name: "candidate_profile_claimed",
    category: "UTILITY",
    language: "en",
    text: "Hi {{1}}, your profile was claimed by a recruiter on TigerHire. Check the app for next steps.",
    examples: ["Priya"],
  },
  {
    name: "candidate_contact_unlocked",
    category: "UTILITY",
    language: "en",
    text: "Hi {{1}}, {{2}} has unlocked your contact on TigerHire. They may reach out to you soon about an opportunity.",
    examples: ["Priya", "Acme Corp"],
  },
  {
    name: "waitlist_confirmation",
    category: "MARKETING",
    language: "en",
    text: "Hi {{1}}, you are on the TigerHire waitlist. We will notify you as soon as your account is ready.",
    examples: ["there"],
  },
  {
    name: "th_shortlisted",
    category: "UTILITY",
    language: "en",
    text: "Hi {{1}}, congratulations! You have been shortlisted for the {{2}} position at {{3}}. Our team will share next steps with you shortly. Reply here if you have any questions.",
    examples: ["Priya", "Senior Engineer", "Acme Corp"],
  },
  {
    name: "th_not_selected",
    category: "UTILITY",
    language: "en",
    text: "Hi {{1}}, thank you for your interest in the {{2}} role at {{3}}. After careful review, the team has decided to move forward with other candidates at this time. We will keep your profile active for future roles that match your skills.",
    examples: ["Priya", "Senior Engineer", "Acme Corp"],
  },
  {
    name: "th_offer",
    category: "UTILITY",
    language: "en",
    text: "Hi {{1}}, exciting news! {{2}} is extending an offer for the {{3}} position. Offer details have been sent to your email. Feel free to reply here with any questions.",
    examples: ["Priya", "Acme Corp", "Senior Engineer"],
  },
  {
    name: "th_interview_slots",
    category: "UTILITY",
    language: "en",
    text: "Hi {{1}}, a recruiter wants to interview you for {{2}}. Please pick a time that works for you: 1) {{3}} 2) {{4}} 3) {{5}}. Reply with 1, 2, or 3 to confirm.",
    examples: ["Priya", "Senior Engineer", "Mon 10:00", "Tue 14:00", "Wed 11:00"],
  },
  {
    name: "th_interview_reminder",
    category: "UTILITY",
    language: "en",
    text: "Hi {{1}}, this is a reminder that your interview for {{2}} is scheduled at {{3}}. Good luck! Reply here if you need to reschedule.",
    examples: ["Priya", "Senior Engineer", "Mon 10:00"],
  },
  {
    name: "recruiter_shortlist_ready",
    category: "UTILITY",
    language: "en",
    text: "Hi {{1}}, your FitScore shortlist for {{2}} is ready. Top candidate score: {{3}}/100. {{4}} candidate(s) shortlisted. View the full list in TigerHire.",
    examples: ["Anita", "Senior Engineer", "88", "5"],
  },
  {
    name: "th_sourcing",
    category: "MARKETING",
    language: "en",
    text: "Hi {{1}}, {{2}} is hiring for {{3}} in {{4}}. CTC range: {{5}}. Interested? Reply YES to get started, or send your CV in PDF to get a FitScore in 2 minutes.",
    examples: ["Rahul", "Acme Corp", "Backend Engineer", "Bengaluru", "20–30 LPA"],
  },
  {
    name: "th_referral_drive",
    category: "MARKETING",
    language: "en",
    text: "Hi {{1}}, {{2}} is looking for a {{3}}. Know someone great? Share this referral link with a friend: {{4}}. Thank you for helping spread the word on TigerHire.",
    examples: ["Kiran", "Acme Corp", "Data Engineer", "https://tigerhire.io/jobs/abc123"],
  },
  {
    name: "th_referral_program_invite",
    category: "UTILITY",
    language: "en",
    text: "Hi {{1}}, you're part of {{2}}'s referral program. Earn rewards by referring great candidates to open roles. Reply YES to get started, or visit your dashboard.",
    examples: ["Rahul", "Acme Corp"],
  },
  {
    name: "th_interview_rescheduled",
    category: "UTILITY",
    language: "en",
    text: "Hi {{1}}, your interview for {{2}} has been rescheduled to {{3}}. Reply here if this does not work for you.",
    examples: ["Priya", "Senior Engineer", "Fri 15:00"],
  },
  {
    name: "th_application_received",
    category: "UTILITY",
    language: "en",
    text: "Hi {{1}}, your application for {{2}} at {{3}} has been received. We will review your profile and get back to you shortly.",
    examples: ["Priya", "Senior Engineer", "Acme Corp"],
  },
  {
    name: "th_profile_incomplete",
    category: "UTILITY",
    language: "en",
    text: "Hi {{1}}, your TigerHire profile is almost complete! Add your {{2}} to improve your FitScore and get better matches. Reply here if you need help.",
    examples: ["Priya", "work experience details"],
  },
  {
    name: "th_recruiter_new_candidates",
    category: "UTILITY",
    language: "en",
    text: "Hi {{1}}, {{2}} new candidate(s) matched your {{3}} role. Top FitScore: {{4}}/100. Check TigerHire to review.",
    examples: ["Anita", "3", "Senior Engineer", "91"],
  },
  {
    name: "th_reengagement",
    category: "MARKETING",
    language: "en",
    text: "Hi {{1}}, {{2}} new role(s) have been posted on TigerHire since your last visit. Reply to see what is new or send your updated CV to refresh your FitScore.",
    examples: ["Rahul", "5"],
  },
  {
    name: "tigerhire_consent_v1",
    category: "UTILITY",
    language: "en",
    text: "Message from TigerHire: {{1}}",
    examples: [
      "Reply YES to consent to CV processing or NO to opt out. TigerHire will only use your data to match you to jobs.",
    ],
  },
  {
    name: "tigerhire_referral_v1",
    category: "UTILITY",
    language: "en",
    text: "Hi {{1}}, {{2}} referred you to a role on TigerHire. Reply YES to get started, or send your CV in PDF to get your FitScore.",
    examples: ["Priya", "Kiran Mehta"],
  },
  {
    name: "tigerhire_referred_candidate_v1",
    category: "UTILITY",
    language: "en",
    text: "Hi {{1}}, {{2}} referred you on TigerHire. Reply YES to continue, or send your CV as a PDF and we will share your FitScore against live roles in about 2 minutes. Privacy: https://tigerhire.io/privacy",
    examples: ["Navya", "Santosh"],
  },
  {
    name: "th_job_match_result",
    category: "UTILITY",
    language: "en",
    text: "Hi {{1}}, we scored your profile against a role on TigerHire. The position is {{2}} based in {{3}}. Your FitScore for this match is {{4}} out of 100. Our quick summary for you: {{5}}. Reply here if you want to discuss next steps or have questions for our team.",
    examples: [
      "Rahul",
      "Backend Engineer",
      "Bengaluru",
      "82",
      "Strong fit — your stack aligns with the role.",
    ],
  },
  {
    name: "th_preference_matches",
    category: "MARKETING",
    language: "en",
    text: "Hi {{1}}! We found {{2}} role(s) matching your preferences: {{3}}. Reply to learn more on TigerHire.",
    examples: ["Rahul", "3", "Backend at Acme, Data at Beta, SRE at Gamma"],
  },
  {
    name: "th_no_match_subscribed",
    category: "MARKETING",
    language: "en",
    text: "Hi {{1}}! No strong match for {{2}} in {{3}} yet, but you are subscribed — we will alert you when better roles appear.",
    examples: ["Rahul", "Senior Engineer", "Hyderabad"],
  },
  {
    name: "th_new_role_alert",
    category: "MARKETING",
    language: "en",
    text: "Hi {{1}}! New match: {{2}} in {{3}}. FitScore {{4}}/100. Open TigerHire to apply or ask questions here.",
    examples: ["Rahul", "Backend Engineer", "Bengaluru", "86"],
  },
  {
    name: "tigerhire_fitscore_v1",
    category: "UTILITY",
    language: "en",
    text: "Hi {{1}}, your resume has been processed on TigerHire. We compared you with {{2}} great matches from {{3}} current openings on the platform. Your strongest lead role is {{4}} with {{5}}. We calculated an overall FitScore of {{6}} out of 100. Open TigerHire to review the full list and take the next step when you are ready.",
    examples: ["Rahul", "2", "12", "Backend Engineer", "Acme Corp", "88"],
  },
  {
    name: "tigerhire_interview_v1",
    category: "UTILITY",
    language: "en",
    text: "Hi {{1}}, {{2}} has interview slots for {{3}}. Option 1: {{4}}. Option 2: {{5}}. Option 3: {{6}}. Reply 1, 2, or 3.",
    examples: ["Rahul", "Anita", "Senior Engineer", "Mon 10:00", "Tue 14:00", "Wed 11:00"],
  },
  {
    name: "tigerhire_reminder_v1",
    category: "UTILITY",
    language: "en",
    text: "Reminder: your interview for {{1}} at {{2}}. Join link: {{3}}. Good luck from TigerHire.",
    examples: ["Senior Engineer", "Acme Corp", "https://tigerhire.io/rooms/abc123"],
  },
  {
    name: "tigerhire_employee_invite_v1",
    category: "UTILITY",
    language: "en",
    text: "Hi {{1}}, {{2}} invited you to join the {{3}} team on TigerHire. Reply here if you need a hand getting started.",
    examples: ["Rahul", "Kiran", "Acme Corp"],
  },
  {
    name: "th_post_hire_pulse",
    category: "UTILITY",
    language: "en",
    text: "Hi {{1}}, how is {{2}} progressing in the {{3}} role? This is your {{4}} check-in. Reply with feedback and we will route it to the right people.",
    examples: ["Kiran", "Sneha", "Product Manager", "30 day"],
  },
  {
    name: "th_referrer_vouch_request",
    category: "UTILITY",
    language: "en",
    text: "Hi! {{1}} just applied via your referral link on TigerHire. We have 5 quick questions to vouch for them — takes 3 minutes.",
    examples: ["Rahul Sharma"],
  },
  {
    name: "th_referrer_magic_link",
    category: "UTILITY",
    language: "en",
    text: "Your TigerHire referrer dashboard link is ready. Click to access: {{1}} — expires in 15 minutes.",
    examples: ["https://tigerhire.io/invite/referrer-token-123"],
  },
  {
    name: "th_job_no_match",
    category: "UTILITY",
    language: "en",
    text: "Hi {{1}}, thanks for your interest. Your profile is not a strong match for {{2}} on TigerHire right now — we will keep you in mind for better-fit roles.",
    examples: ["Priya", "Senior Engineer at Acme"],
  },
  {
    name: "th_referrer_offer_update",
    category: "UTILITY",
    language: "en",
    text: "Hi, great news — {{1}} has received an offer for {{2}} at {{3}}. Your referral bonus of {{4}} is pending confirmation.",
    examples: ["Priya", "Senior Engineer", "Acme Corp", "INR 15000"],
  },
  {
    name: "th_referrer_rejection_update",
    category: "UTILITY",
    language: "en",
    text: "Hi, an update on your referral — {{1}} was not selected for the {{2}} role this time. Thank you for referring.",
    examples: ["Priya", "Senior Engineer"],
  },
];

async function main(): Promise<void> {
  const onlyName = process.argv[2]?.trim();
  const rows = onlyName ? TEMPLATE_ROWS.filter((row) => row.name === onlyName) : [...TEMPLATE_ROWS];
  if (onlyName && rows.length === 0) {
    throw new Error(`Unknown template name: ${onlyName}`);
  }

  console.log("Create WhatsApp templates via Graph API: POST {WABA_ID}/message_templates\n");
  if (onlyName) {
    console.log(`Single-template mode: ${onlyName}\n`);
  }
  if (!process.env.WHATSAPP_I_UNDERSTAND_TEMPLATE_SPAM) {
    const n = onlyName ? rows.length : 1 + TEMPLATE_ROWS.length;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      `This will submit up to ${n} template(s) to Meta (may be rate-limited; duplicates are skipped when Meta reports they already exist).\nType yes to continue: `,
    );
    rl.close();
    if (answer.trim().toLowerCase() !== "yes") {
      console.log(
        "Aborted. Set WHATSAPP_I_UNDERSTAND_TEMPLATE_SPAM=yes to skip this prompt next time.",
      );
      return;
    }
  }

  const otpCategory = (
    process.env.TH_REFERRER_OTP_TEMPLATE_CATEGORY ?? "AUTHENTICATION"
  ).toUpperCase();
  const token = requireEnv("WHATSAPP_ACCESS_TOKEN");
  const phoneId = requireEnv("WHATSAPP_PHONE_NUMBER_ID");
  const explicitWabaId = process.env.WHATSAPP_WABA_ID?.trim();
  const wabaId = explicitWabaId || (await resolveWabaId(phoneId, token));
  if (explicitWabaId) {
    console.log(`Using WHATSAPP_WABA_ID=${explicitWabaId} (no lookup from phone id)\n`);
  } else {
    console.log(`Resolved WABA from phone: ${wabaId}\n`);
  }

  const otpPayload: Record<string, unknown> =
    otpCategory === "UTILITY" || process.env.FORCE_UTILITY_OTP === "1"
      ? {
          name: "th_referrer_otp",
          language: "en",
          category: "UTILITY",
          components: [
            {
              type: "BODY",
              text: "Your TigerHire verification code is {{1}}. Valid for 10 minutes. Do not share this with anyone.",
              example: { body_text: [["482951"]] },
            },
          ],
        }
      : {
          name: "th_referrer_otp",
          language: "en_US",
          category: "AUTHENTICATION",
          components: [
            { type: "BODY", add_security_recommendation: true } as unknown as MetaBodyComponent,
            { type: "FOOTER", code_expiration_minutes: 10 } as unknown as Record<string, unknown>,
            {
              type: "BUTTONS",
              buttons: [{ type: "OTP" as const, otp_type: "COPY_CODE" } as MetaOtpButton],
            },
          ],
        };

  if (otpCategory === "UTILITY") {
    console.warn(
      "[th_referrer_otp] UTILITY with custom code body — if Meta rejects, try AUTHENTICATION (default) or set TH_REFERRER_OTP_TEMPLATE_CATEGORY=UTILITY and adjust.\n",
    );
  }

  if (!onlyName) {
    const otpResult = await metaCreateTemplate(wabaId, token, otpPayload);
    console.log(
      `[th_referrer_otp] ${otpResult.ok || isAlreadyExists(otpResult.data) ? "OK" : "FAIL"} HTTP ${otpResult.status}`,
      JSON.stringify(otpResult.data),
    );
    if (!otpResult.ok && isAlreadyExists(otpResult.data)) {
      console.log("  (treated as OK: template already exists)");
    }
  }

  let delay = 0;
  for (const row of rows) {
    if (delay > 0) await sleep(delay);
    delay = 350;
    const payload = rowToPayload(row);
    const r = await metaCreateTemplate(wabaId, token, payload);
    const label = r.ok || isAlreadyExists(r.data) ? "OK" : "FAIL";
    console.log(`[${row.name}] ${label} HTTP ${r.status}`, JSON.stringify(r.data));
    if (!r.ok && isAlreadyExists(r.data)) {
      console.log("  (already exists — skip)");
    }
  }

  console.log("\nDone. Check WhatsApp Manager: templates show as Pending until Meta approves.");
  console.log(
    "For AUTHENTICATION OTP layout issues, set TH_REFERRER_OTP_TEMPLATE_CATEGORY=UTILITY in .env.local and re-run th_referrer_otp only if needed.",
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

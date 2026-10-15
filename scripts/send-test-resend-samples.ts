/**
 * Send one of each main TigerHire Resend (transactional) template to a test inbox.
 *
 *   npx tsx scripts/send-test-resend-samples.ts [recipient@email.com]
 *
 * Loads `.env.local` from the repo root before any app `env` reads.
 *
 * Requires: RESEND_API_KEY, RESEND_FROM_EMAIL. Do not set EMAIL_MODE=sandbox.
 * (Prod Vercel also needs OUTBOUND_NOTIFICATIONS_ENABLED=true; local dev is fine without it.)
 *
 * Uses Resend directly (avoids importing `src/lib/services/resend` because of `server-only`).
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
for (const name of [".env.local", ".env"]) {
  const r = config({ path: resolve(root, name) });
  if (r.parsed && Object.keys(r.parsed).length) break;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const recipient = (process.argv[2] ?? "santoshsms@gmail.com").trim().toLowerCase();
const pauseMs = 600;

void (async () => {
  const { Resend } = await import("resend");
  const { env } = await import("../src/lib/config/env");
  const t = await import("../src/lib/services/email-templates");

  if (!env.resendApiKey?.trim()) {
    console.error("Missing RESEND_API_KEY. Add it to .env.local and re-run.");
    process.exit(1);
  }
  if (env.emailSandbox) {
    console.error(
      "EMAIL_MODE=sandbox is on — no real sends. Unset EMAIL_MODE or set to something other than 'sandbox'.",
    );
    process.exit(1);
  }
  if (env.isProductionOutboundHold) {
    console.error(
      "OUTBOUND is on hold in this environment (Vercel prod without OUTBOUND_NOTIFICATIONS_ENABLED). Use local dev with .env.local for real sends, or set OUTBOUND_NOTIFICATIONS_ENABLED=true in prod.",
    );
    process.exit(1);
  }

  const resend = new Resend(env.resendApiKey);
  const send = (subject: string, html: string) =>
    resend.emails.send({
      from: env.resendFromEmail,
      to: recipient,
      subject,
      html,
    });

  console.log(`Sending sample transactional emails to ${recipient} (staggered ${pauseMs}ms)…`);
  console.log(`from: ${env.resendFromEmail} | base: ${env.baseUrl}\n`);

  const batch: { subject: string; html: string }[] = [
    {
      subject: "[Test] Job matches for you on TigerHire",
      html: t.matchAlertHtml({
        candidateName: "Santosh",
        matchCount: 3,
        topRole: "Engineering Manager",
        topCompany: "Acme",
      }),
    },
    {
      subject: "[Test] FitScore shortlist is ready",
      html: t.fitScoreReadyHtml({ candidateCount: 5, roleName: "Product Designer", topScore: 88 }),
    },
    {
      subject: "[Test] Application received",
      html: t.applicationConfirmationHtml({
        candidateName: "Santosh",
        jobTitle: "Founding Engineer",
        companyName: "TigerHire Demo",
      }),
    },
    {
      subject: "[Test] You’ve been shortlisted",
      html: t.applicationStatusUpdateHtml({
        candidateName: "Santosh",
        jobTitle: "Founding Engineer",
        companyName: "Acme",
        status: "shortlisted",
      }),
    },
    {
      subject: "[Test] Application update (stage change)",
      html: t.pipelineStageUpdateHtml({
        candidateName: "Santosh",
        jobTitle: "Founding Engineer",
        companyName: "Acme",
        stageName: "Panel interview",
      }),
    },
    {
      subject: "[Test] Interview confirmed",
      html: t.interviewBookedHtml({
        candidateName: "Santosh",
        jobTitle: "Founding Engineer",
        interviewDate: "Monday, 4 May 2026",
        interviewTime: "2:00 PM",
        timezone: "IST",
      }),
    },
    {
      subject: "[Test] Interview reminder",
      html: t.interviewReminderHtml({
        recipientName: "Santosh",
        jobTitle: "Founding Engineer",
        interviewDate: "4 May 2026",
        interviewTime: "2:00 PM",
        timezone: "IST",
      }),
    },
    {
      subject: "[Test] New message in your inbox",
      html: t.newInboxMessageNotificationHtml({
        recipientName: "Santosh",
        senderName: "Alex Recruiter",
        messagePreview: "Hi — are you free Tuesday afternoon for a quick call?",
        threadUrl: `${env.baseUrl}/messages`,
      }),
    },
    {
      subject: "[Test] Saved search: new jobs",
      html: t.savedSearchJobAlertHtml({
        name: "Santosh",
        searchName: "Remote product",
        jobCount: 2,
        jobs: [
          { title: "PM", company: "X", location: "Remote", remoteOk: true },
          { title: "AP", company: "Y", location: "Bangalore", remoteOk: true },
        ],
      }),
    },
    {
      subject: "[Test] Team invite to TigerHire",
      html: t.inviteHtml({
        inviterName: "Jamie",
        organisationName: "Acme R&D",
        token: "sample-token",
      }),
    },
    {
      subject: "[Test] Contact form (internal copy)",
      html: t.contactNotificationHtml({
        name: "Test User",
        email: recipient,
        company: "TestCo",
        type: "demo",
        message: "This is a sample lead message for design review.",
      }),
    },
    {
      subject: "[Test] Role closed (candidate)",
      html: t.jobClosedCandidateHtml({
        candidateName: "Santosh",
        jobTitle: "Data Engineer",
        companyName: "Zed",
      }),
    },
    {
      subject: "[Test] Referral role closed",
      html: t.jobClosedReferrerHtml({
        referrerName: "Santosh",
        jobTitle: "SDE II",
        companyName: "Zed",
      }),
    },
    {
      subject: "[Test] Your offer (native signing link)",
      html: t.offerNativeSigningInviteCandidateHtml({
        candidateName: "Santosh",
        jobTitle: "Staff Engineer",
        companyName: "Acme",
        signingUrl: `${env.baseUrl}/offers/example-token`,
      }),
    },
  ];

  let n = 0;
  for (const msg of batch) {
    n += 1;
    const result = await send(msg.subject, msg.html);
    if (result.error) {
      console.error(`[${n}/${batch.length}] FAIL`, msg.subject, result.error);
    } else {
      const id = result.data?.id;
      console.log(`[${n}/${batch.length}] ok`, id ?? "sent", msg.subject);
    }
    await sleep(pauseMs);
  }
  console.log(`\nDone. Sent up to ${batch.length} sample emails. Check ${recipient} (and spam).`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

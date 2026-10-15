/**
 * Send one copy of every TigerHire transactional email template to a test inbox.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/send-all-notification-emails.ts
 *   npx tsx --env-file=.env.local scripts/send-all-notification-emails.ts you@example.com
 *
 * Requires RESEND_API_KEY (live key for delivery). Set EMAIL_MODE=sandbox to dry-run log only.
 * Auth emails (magic link, reset, signup) are sent via Supabase separately at the end.
 */
import dotenv from "dotenv";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { env } from "../src/lib/config/env";
import { sendEmail } from "../src/lib/services/resend";
import {
  matchAlertHtml,
  fitScoreReadyHtml,
  inviteHtml,
  applicationWithdrawnHtml,
  interviewBookedHtml,
  interviewCancelledHtml,
  interviewRescheduledHtml,
  interviewReminderHtml,
  applicationConfirmationHtml,
  emailIntakeAcknowledgementHtml,
  pipelineStageUpdateHtml,
  applicationStatusUpdateHtml,
  jobClosedCandidateHtml,
  jobClosedReferrerHtml,
  contactNotificationHtml,
  offerNativeSigningInviteCandidateHtml,
  offerNativeSigningInviteCompanyHtml,
  offerNativeOfferSentRecruiterHtml,
  offerNativeSignedCandidateConfirmationHtml,
  offerNativeSignedHrConfirmationHtml,
  offerNativeSigningReminderCandidateHtml,
  offerNativeExpiredRecruiterHtml,
  offerNativeWithdrawnCandidateHtml,
  offerNativeDeclinedRecruiterHtml,
  newInboxMessageNotificationHtml,
  savedSearchJobAlertHtml,
  assessmentShareInviteEmailHtml,
  orchestratorShortlistOpportunityHtml,
  orchestratorHiredCongratulationHtml,
  orchestratorRejectionUpdateHtml,
  interviewerSelfScheduleBookedHtml,
  pendingApprovalTaskEmailHtml,
  feedbackDueTaskEmailHtml,
  interviewConfirmedTaskEmailHtml,
  interviewerFeedbackReminderHtml,
} from "../src/lib/services/email-templates";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.pilot-e2e.local") });

const TO = (process.argv[2] ?? "santoshsms@gmail.com").trim().toLowerCase();
const BASE = (env.baseUrl ?? "https://tigerhire.io").replace(/\/$/, "");
const SAMPLE = {
  name: "Santosh",
  candidateName: "Pilot Candidate",
  recruiterName: "Rajiv Menon",
  companyName: "Finstack",
  jobTitle: "QA Engineer",
  roleTitle: "QA Engineer",
  orgName: "Finstack",
  stageName: "Technical interview",
  when: "Tuesday, 20 May 2026 · 2:00 PM IST",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type Mail = {
  id: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: string }[];
};

function buildMails(): Mail[] {
  const signingUrl = `${BASE}/offers/test-token-sign`;
  const tasksUrl = `${BASE}/tasks?jobId=test`;
  const token = "test-invite-token";
  const shareToken = "testassessmentshare0001";

  const mails: Mail[] = [
    {
      id: "match_alert",
      subject: "3 companies on TigerHire are hiring for your role",
      html: matchAlertHtml({
        candidateName: SAMPLE.name,
        matchCount: 3,
        topRole: SAMPLE.jobTitle,
        topCompany: SAMPLE.companyName,
      }),
    },
    {
      id: "fitscore_ready",
      subject: `FitScore shortlist ready for ${SAMPLE.jobTitle}`,
      html: fitScoreReadyHtml({
        recruiterEmail: TO,
        roleName: SAMPLE.jobTitle,
        topScore: 87,
        candidateCount: 12,
      }),
    },
    {
      id: "invite",
      subject: `You've been invited to ${SAMPLE.companyName} on TigerHire`,
      html: inviteHtml({
        email: TO,
        inviterName: SAMPLE.recruiterName,
        organisationName: SAMPLE.companyName,
        token,
      }),
    },
    {
      id: "application_confirmation",
      subject: `Application received: ${SAMPLE.jobTitle} at ${SAMPLE.companyName}`,
      html: applicationConfirmationHtml({
        candidateName: SAMPLE.candidateName,
        jobTitle: SAMPLE.jobTitle,
        companyName: SAMPLE.companyName,
      }),
    },
    {
      id: "email_intake_ack",
      subject: `Profile received: ${SAMPLE.jobTitle} at ${SAMPLE.companyName}`,
      html: emailIntakeAcknowledgementHtml({
        candidateName: SAMPLE.candidateName,
        jobTitle: SAMPLE.jobTitle,
        companyName: SAMPLE.companyName,
      }),
    },
    {
      id: "pipeline_stage_update",
      subject: `Update on your application: ${SAMPLE.jobTitle}`,
      html: pipelineStageUpdateHtml({
        candidateName: SAMPLE.candidateName,
        jobTitle: SAMPLE.jobTitle,
        companyName: SAMPLE.companyName,
        stageName: SAMPLE.stageName,
        customBodyHtml: "Custom recruiter note from plan automation.",
      }),
    },
    {
      id: "application_withdrawn_recruiter",
      subject: `Application withdrawn: ${SAMPLE.candidateName} – ${SAMPLE.jobTitle}`,
      html: applicationWithdrawnHtml({
        candidateName: SAMPLE.candidateName,
        jobTitle: SAMPLE.jobTitle,
      }),
    },
    {
      id: "interview_booked",
      subject: `Interview scheduled: ${SAMPLE.jobTitle}`,
      html: interviewBookedHtml({
        candidateName: SAMPLE.candidateName,
        jobTitle: SAMPLE.jobTitle,
        interviewDate: "Tuesday, 20 May 2026",
        interviewTime: "2:00 PM",
        timezone: "IST",
      }),
    },
    {
      id: "interview_cancelled",
      subject: `Interview cancelled: ${SAMPLE.jobTitle}`,
      html: interviewCancelledHtml({
        recipientName: SAMPLE.name,
        jobTitle: SAMPLE.jobTitle,
        originalDate: "Tuesday, 20 May 2026",
      }),
    },
    {
      id: "interview_rescheduled",
      subject: `Interview rescheduled: ${SAMPLE.jobTitle}`,
      html: interviewRescheduledHtml({
        recipientName: SAMPLE.name,
        jobTitle: SAMPLE.jobTitle,
        oldDate: "Tuesday, 20 May 2026",
        newDate: "Wednesday, 21 May 2026",
        newTime: "3:00 PM",
        timezone: "IST",
      }),
    },
    {
      id: "interview_reminder",
      subject: `Reminder: Interview for ${SAMPLE.jobTitle} tomorrow`,
      html: interviewReminderHtml({
        recipientName: SAMPLE.name,
        jobTitle: SAMPLE.jobTitle,
        interviewDate: "Wednesday, 21 May 2026",
        interviewTime: "3:00 PM",
        timezone: "IST",
      }),
    },
    {
      id: "job_closed_candidate",
      subject: `Role closed: ${SAMPLE.jobTitle}`,
      html: jobClosedCandidateHtml({
        candidateName: SAMPLE.candidateName,
        jobTitle: SAMPLE.jobTitle,
        companyName: SAMPLE.companyName,
      }),
    },
    {
      id: "job_closed_referrer",
      subject: `Referral role closed: ${SAMPLE.jobTitle}`,
      html: jobClosedReferrerHtml({
        referrerName: SAMPLE.name,
        jobTitle: SAMPLE.jobTitle,
        companyName: SAMPLE.companyName,
      }),
    },
    {
      id: "orchestrator_shortlist",
      subject: `Interview opportunity: ${SAMPLE.jobTitle} at ${SAMPLE.orgName}`,
      html: orchestratorShortlistOpportunityHtml({
        candidateName: SAMPLE.candidateName,
        roleTitle: SAMPLE.jobTitle,
        orgName: SAMPLE.orgName,
      }),
    },
    {
      id: "orchestrator_hired",
      subject: `Great news about your application for ${SAMPLE.jobTitle}`,
      html: orchestratorHiredCongratulationHtml({
        candidateName: SAMPLE.candidateName,
        jobTitle: SAMPLE.jobTitle,
        companyName: SAMPLE.companyName,
      }),
    },
    {
      id: "orchestrator_rejected",
      subject: `Update on your application for ${SAMPLE.jobTitle}`,
      html: orchestratorRejectionUpdateHtml({
        candidateName: SAMPLE.candidateName,
        jobTitle: SAMPLE.jobTitle,
        companyName: SAMPLE.companyName,
      }),
    },
    {
      id: "inbox_message",
      subject: "New message from Rajiv on TigerHire",
      html: newInboxMessageNotificationHtml({
        recipientName: SAMPLE.name,
        senderName: SAMPLE.recruiterName,
        messagePreview: "Can you share your availability for a panel this week?",
        threadUrl: `${BASE}/messages/test-conversation`,
      }),
    },
    {
      id: "saved_search_alert",
      subject: "New jobs for your saved search: QA roles",
      html: savedSearchJobAlertHtml({
        name: SAMPLE.name,
        searchName: "QA roles",
        jobCount: 2,
        jobs: [
          {
            title: SAMPLE.jobTitle,
            company: SAMPLE.companyName,
            location: "Bengaluru",
            remoteOk: true,
          },
          {
            title: "Senior QA Engineer",
            company: "Razorpay",
            location: "Bengaluru",
            remoteOk: false,
          },
        ],
      }),
    },
    {
      id: "assessment_share",
      subject: `Assessment assigned: Take-home QA exercise`,
      html: assessmentShareInviteEmailHtml({
        recipientName: SAMPLE.name,
        assessmentTitle: "Take-home QA exercise",
        shareUrl: `${BASE}/assessments/${shareToken}`,
        shareToken,
        deadlineLabel: "Friday, 23 May 2026, 6:00 PM",
      }),
    },
    {
      id: "offer_signing_invite_candidate",
      subject: `Your offer from ${SAMPLE.companyName} — ${SAMPLE.roleTitle}`,
      html: offerNativeSigningInviteCandidateHtml({
        candidateName: SAMPLE.candidateName,
        jobTitle: SAMPLE.roleTitle,
        companyName: SAMPLE.companyName,
        signingUrl,
      }),
    },
    {
      id: "offer_signing_invite_company",
      subject: `Signature needed for ${SAMPLE.roleTitle} — ${SAMPLE.companyName}`,
      html: offerNativeSigningInviteCompanyHtml({
        signerName: SAMPLE.name,
        jobTitle: SAMPLE.roleTitle,
        companyName: SAMPLE.companyName,
        signingUrl: `${BASE}/offers/company-sign/test-company-token`,
      }),
    },
    {
      id: "offer_sent_recruiter",
      subject: `Offer sent to ${SAMPLE.candidateName}`,
      html: offerNativeOfferSentRecruiterHtml({
        recruiterName: SAMPLE.recruiterName,
        candidateName: SAMPLE.candidateName,
        jobTitle: SAMPLE.roleTitle,
        companyName: SAMPLE.companyName,
        companyOffersUrl: `${BASE}/company/offers`,
      }),
    },
    {
      id: "offer_signed_candidate",
      subject: `Offer signed — ${SAMPLE.roleTitle}`,
      html: offerNativeSignedCandidateConfirmationHtml({
        candidateName: SAMPLE.candidateName,
        jobTitle: SAMPLE.roleTitle,
        companyName: SAMPLE.companyName,
      }),
    },
    {
      id: "offer_signed_hr",
      subject: `Offer signed by ${SAMPLE.candidateName}`,
      html: offerNativeSignedHrConfirmationHtml({
        hrName: SAMPLE.recruiterName,
        candidateName: SAMPLE.candidateName,
        jobTitle: SAMPLE.roleTitle,
        companyName: SAMPLE.companyName,
        companyOffersUrl: `${BASE}/company/offers`,
      }),
    },
    {
      id: "offer_signing_reminder",
      subject: `Reminder: Sign your offer — ${SAMPLE.roleTitle}`,
      html: offerNativeSigningReminderCandidateHtml({
        candidateName: SAMPLE.candidateName,
        jobTitle: SAMPLE.roleTitle,
        companyName: SAMPLE.companyName,
        signingUrl,
        hoursRemaining: 24,
      }),
    },
    {
      id: "offer_expired_recruiter",
      subject: `Offer expired: ${SAMPLE.candidateName}`,
      html: offerNativeExpiredRecruiterHtml({
        recruiterName: SAMPLE.recruiterName,
        candidateName: SAMPLE.candidateName,
        jobTitle: SAMPLE.roleTitle,
        companyOffersUrl: `${BASE}/company/offers`,
      }),
    },
    {
      id: "offer_withdrawn",
      subject: `Offer withdrawn: ${SAMPLE.roleTitle}`,
      html: offerNativeWithdrawnCandidateHtml({
        candidateName: SAMPLE.candidateName,
        jobTitle: SAMPLE.roleTitle,
        companyName: SAMPLE.companyName,
      }),
    },
    {
      id: "offer_declined_recruiter",
      subject: `Offer declined: ${SAMPLE.candidateName}`,
      html: offerNativeDeclinedRecruiterHtml({
        recruiterName: SAMPLE.recruiterName,
        candidateName: SAMPLE.candidateName,
        jobTitle: SAMPLE.roleTitle,
        reason: "Accepted another opportunity.",
        companyOffersUrl: `${BASE}/company/offers`,
      }),
    },
    {
      id: "task_pending_approval",
      subject: "Shortlist approval needed: Pilot Candidate",
      html: pendingApprovalTaskEmailHtml({
        recipientName: SAMPLE.name,
        title: "Shortlist approval needed: Pilot Candidate",
        bodyLines: [
          `Role: ${SAMPLE.jobTitle}`,
          "Recruiter has shortlisted this candidate for the next stage.",
        ],
        tasksUrl,
      }),
    },
    {
      id: "task_feedback_due",
      subject: `Feedback due: ${SAMPLE.candidateName}`,
      html: feedbackDueTaskEmailHtml({
        recipientName: SAMPLE.name,
        title: `Feedback due: ${SAMPLE.candidateName}`,
        bodyLines: [`Role: ${SAMPLE.jobTitle}`, `Interview: ${SAMPLE.when}`],
        tasksUrl,
      }),
    },
    {
      id: "task_interview_confirmed",
      subject: `Interview confirmed: ${SAMPLE.candidateName}`,
      html: interviewConfirmedTaskEmailHtml({
        recipientName: SAMPLE.name,
        title: `Interview confirmed: ${SAMPLE.candidateName}`,
        bodyLines: [`When: ${SAMPLE.when}`, `Role: ${SAMPLE.jobTitle}`],
        tasksUrl,
      }),
    },
    {
      id: "interviewer_feedback_reminder",
      subject: `Feedback due: ${SAMPLE.candidateName} (${SAMPLE.jobTitle})`,
      html: interviewerFeedbackReminderHtml({
        recipientName: SAMPLE.name,
        candidateName: SAMPLE.candidateName,
        jobTitle: SAMPLE.jobTitle,
        interviewAt: SAMPLE.when,
        templateName: "Standard technical feedback",
        fields: [{ label: "Overall recommendation" }, { label: "Technical depth" }],
        companyInterviewsUrl: `${BASE}/company/interviews`,
      }),
    },
    {
      id: "interviewer_self_schedule",
      subject: `New booking: ${SAMPLE.candidateName} — ${SAMPLE.jobTitle}`,
      html: interviewerSelfScheduleBookedHtml({
        stageName: SAMPLE.stageName,
        jobTitle: SAMPLE.jobTitle,
        candidateName: SAMPLE.candidateName,
        whenLabel: SAMPLE.when,
        recruitInterviewsUrl: `${BASE}/recruit/interviews`,
      }),
    },
    {
      id: "plan_comms_generic",
      subject: `Update on ${SAMPLE.jobTitle}`,
      html: `<p>Hi ${escapeHtml(SAMPLE.candidateName)},</p><p>You have moved to the <strong>${escapeHtml(
        SAMPLE.stageName,
      )}</strong> stage for <strong>${escapeHtml(SAMPLE.jobTitle)}</strong>.</p><p>— TigerHire</p>`,
    },
    {
      id: "finance_offer_approval",
      subject: `Offer requires finance approval — ${SAMPLE.roleTitle}`,
      html: `<p>An offer for ${escapeHtml(SAMPLE.roleTitle)} is pending your review.</p>
<p><a href="${BASE}/approve/test-approve">Approve</a> · <a href="${BASE}/approve/test-reject">Reject</a></p>
<p style="color:#666;font-size:13px">Test links only. <a href="${BASE}/company/finance">Finance inbox</a></p>`,
    },
    {
      id: "band_exception_approval",
      subject: `Compensation band exception needs approval — ${SAMPLE.roleTitle}`,
      html: `<p>An offer for ${escapeHtml(SAMPLE.roleTitle)} is outside the selected compensation band.</p>
<p><a href="${BASE}/approve/test-band-approve">Approve exception</a> · <a href="${BASE}/approve/test-band-reject">Reject</a></p>`,
    },
    {
      id: "offer_public_otp",
      subject: "Your TigerHire offer verification code",
      html: `<p>Your one-time code to view and sign your offer is:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:4px;">847291</p>
<p>This code expires in 10 minutes.</p>`,
    },
    {
      id: "interviewer_availability_nudge",
      subject: `Declare availability for ${SAMPLE.jobTitle}`,
      html: `<p>Hi ${escapeHtml(SAMPLE.name)},</p>
<p>You're an interviewer on ${escapeHtml(SAMPLE.jobTitle)}. Add your availability so recruiters can schedule efficiently.</p>
<p><a href="${BASE}/company/my-availability">Declare your availability</a></p>`,
    },
    {
      id: "sso_pending_approval",
      subject: "TigerHire: SSO user pending approval",
      html: `<p>${escapeHtml(TO)} signed in with your company SSO domain and is pending approval.</p><p>Review in Company settings &gt; Permissions.</p>`,
    },
    {
      id: "interviewer_reschedule_plain",
      subject: `Interview rescheduled: ${SAMPLE.candidateName} - ${SAMPLE.jobTitle}`,
      html: `<p>Hi Interviewer,</p><p>The interview with ${escapeHtml(SAMPLE.candidateName)} has been rescheduled.</p><p><strong>New time:</strong> ${escapeHtml(SAMPLE.when)}</p>`,
      attachments: [
        {
          filename: "interview-invite.ics",
          content: Buffer.from(
            [
              "BEGIN:VCALENDAR",
              "VERSION:2.0",
              "BEGIN:VEVENT",
              "SUMMARY:Interview",
              "DTSTART:20260520T083000Z",
              "DTEND:20260520T093000Z",
              "END:VEVENT",
              "END:VCALENDAR",
            ].join("\r\n"),
            "utf8",
          ).toString("base64"),
        },
      ],
    },
    {
      id: "contact_form_copy",
      subject: "[TigerHire Contact] demo: Test User",
      html: contactNotificationHtml({
        name: "Test User",
        email: TO,
        company: SAMPLE.companyName,
        type: "demo",
        message: "This is a test contact form submission copy sent to your inbox.",
      }),
    },
  ];

  for (const status of ["shortlisted", "in_progress", "hired", "rejected"] as const) {
    const subject =
      status === "shortlisted"
        ? `You've been shortlisted: ${SAMPLE.jobTitle}`
        : status === "hired"
          ? `You've been hired: ${SAMPLE.jobTitle}`
          : `Update on your application: ${SAMPLE.jobTitle}`;
    mails.push({
      id: `application_status_${status}`,
      subject,
      html: applicationStatusUpdateHtml({
        candidateName: SAMPLE.candidateName,
        jobTitle: SAMPLE.jobTitle,
        companyName: SAMPLE.companyName,
        status,
      }),
    });
  }

  return mails;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!process.env.RESEND_API_KEY?.trim()) {
    console.error("Missing RESEND_API_KEY in .env.local");
    process.exit(1);
  }

  if (env.emailSandbox) {
    console.warn("EMAIL_MODE=sandbox — emails will be logged only, not delivered.");
  }
  if (env.isProductionOutboundHold) {
    console.warn("OUTBOUND_HOLD active — emails will not be sent to Resend.");
  }

  const mails = buildMails();
  const total = mails.length;
  console.log(`Sending ${total} Resend templates to ${TO}…\n`);

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < mails.length; i++) {
    const m = mails[i]!;
    const subject = `[TEST ${i + 1}/${total}] ${m.id}: ${m.subject}`;
    try {
      const result = await sendEmail({
        to: TO,
        subject,
        html: m.html,
        attachments: m.attachments,
      });
      const err = (result as { error?: unknown }).error;
      if (err) {
        console.error(`  ✗ ${m.id}:`, err);
        failed++;
      } else {
        const id = (result as { data?: { id?: string } }).data?.id;
        console.log(`  ✓ ${m.id}${id ? ` (${id})` : ""}`);
        sent++;
      }
    } catch (e) {
      console.error(`  ✗ ${m.id}:`, e);
      failed++;
    }
    await sleep(600);
  }

  console.log(`\nResend batch: ${sent} sent, ${failed} failed.`);

  console.log("\nSupabase auth emails (magic link, password reset, signup)…");
  const root = process.cwd();
  for (const type of ["magic-link", "reset", "signup"]) {
    const r = spawnSync("node", ["scripts/send-test-auth-email.mjs", type, TO], {
      cwd: root,
      stdio: "inherit",
      env: process.env,
    });
    if (r.status !== 0) {
      console.warn(`  Auth ${type}: failed (check Supabase SMTP / redirect URLs)`);
    }
    await sleep(2000);
  }

  console.log(`\nDone. Check ${TO} (and spam). Subjects are prefixed [TEST n/N].`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

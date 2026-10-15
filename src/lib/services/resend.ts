import { Resend } from "resend";
import type { CreateEmailResponse } from "resend";
import { env } from "@/lib/config/env";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { getCorrelationId } from "@/lib/observability/correlation";
import { createResilientCall } from "@/lib/utils/resilient-call";
import {
  matchAlertHtml,
  fitScoreReadyHtml,
  inviteHtml,
  applicationConfirmationHtml,
  emailIntakeAcknowledgementHtml,
  applicationWithdrawnHtml,
  applicationStatusUpdateHtml,
  pipelineStageUpdateHtml,
  interviewBookedHtml,
  interviewCancelledHtml,
  interviewRescheduledHtml,
  interviewReminderHtml,
  contactNotificationHtml,
  jobClosedCandidateHtml,
  jobClosedReferrerHtml,
} from "./email-templates";

const resendCall = createResilientCall({
  service: "resend",
  timeoutMs: 15_000,
  maxRetries: 2,
});

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(env.resendApiKey);
  }
  return _resend;
}

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  /** Base64-encoded file contents (Resend attachments API). */
  attachments?: { filename: string; content: string }[];
}

type EmailCategory =
  | "marketing"
  | "job_alerts"
  | "application_updates"
  | "messages"
  | "interview_reminders"
  | "weekly_digest";

type SendResult =
  | { skipped: false; data: Awaited<ReturnType<Resend["emails"]["send"]>> }
  | { skipped: true; reason: "email_preference_disabled" };

export async function shouldSendEmail(
  recipientEmail: string,
  category: EmailCategory,
): Promise<boolean> {
  try {
    const admin = createSupabaseAdmin();
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", recipientEmail)
      .maybeSingle();

    if (!profile) return true;

    const { data: prefs } = await admin
      .from("email_preferences")
      .select(category)
      .eq("user_id", profile.id)
      .maybeSingle();

    if (!prefs) return true;

    return (prefs as Record<string, unknown>)[category] !== false;
  } catch (err) {
    logger.error("shouldSendEmail check failed, defaulting to send", {
      recipientEmail,
      category,
      error: String(err),
    });
    return true;
  }
}

export async function sendEmail(params: SendEmailParams) {
  if (env.emailSandbox) {
    logger.info("[EMAIL_SANDBOX] would send", {
      to: params.to,
      subject: params.subject,
      replyTo: params.replyTo,
    });
    return {
      data: { id: `sandbox-${Date.now()}` },
      error: null,
      headers: null,
    };
  }

  if (env.isProductionOutboundHold) {
    // Fail LOUDLY. Returning a fake success id with a null error meant callers
    // (bulk invites, offer letters, interview invites) reported "sent" while
    // nothing left the building — a silent go-live killer. Callers that already
    // handle send errors now degrade correctly and DLQ.
    logger.error(
      "[OUTBOUND_HOLD] email suppressed — set OUTBOUND_NOTIFICATIONS_ENABLED=true on production",
      {
        to_len: Array.isArray(params.to) ? params.to.length : 1,
        subject: params.subject,
      },
    );
    return {
      data: null,
      error: {
        name: "application_error",
        message:
          "Outbound notifications are disabled on this deployment (OUTBOUND_NOTIFICATIONS_ENABLED is not set).",
        statusCode: 503,
      },
      headers: null,
    } as CreateEmailResponse;
  }

  const resend = getResend();
  const correlationId = getCorrelationId();
  return resendCall(
    () =>
      resend.emails.send({
        from: env.resendFromEmail,
        to: params.to,
        subject: params.subject,
        html: params.html,
        replyTo: params.replyTo,
        ...(params.attachments?.length ? { attachments: params.attachments } : {}),
        ...(correlationId && {
          headers: { "X-Correlation-Id": correlationId },
        }),
      }),
    `sendEmail:${params.to}`,
  );
}

export async function sendMatchAlert(params: {
  candidateEmail: string;
  candidateName: string;
  matchCount: number;
  topRole: string;
  topCompany: string;
}): Promise<SendResult> {
  if (!(await shouldSendEmail(params.candidateEmail, "job_alerts"))) {
    return { skipped: true, reason: "email_preference_disabled" };
  }
  const data = await sendEmail({
    to: params.candidateEmail,
    subject: `${params.matchCount} companies on TigerHire are hiring for your role`,
    html: matchAlertHtml(params),
  });
  return { skipped: false, data };
}

export async function sendFitScoreReady(params: {
  recruiterEmail: string;
  roleName: string;
  topScore: number;
  candidateCount: number;
}): Promise<SendResult> {
  if (!(await shouldSendEmail(params.recruiterEmail, "application_updates"))) {
    return { skipped: true, reason: "email_preference_disabled" };
  }
  const data = await sendEmail({
    to: params.recruiterEmail,
    subject: `FitScore shortlist ready for ${params.roleName}`,
    html: fitScoreReadyHtml(params),
  });
  return { skipped: false, data };
}

export async function sendInviteEmail(params: {
  email: string;
  inviterName: string;
  organisationName: string;
  token: string;
}) {
  return sendEmail({
    to: params.email,
    subject: `You've been invited to ${params.organisationName} on TigerHire`,
    html: inviteHtml(params),
  });
}

export async function sendPipelineStageUpdateEmail(params: {
  candidateEmail: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  stageName: string;
  customBodyHtml?: string | null;
}): Promise<SendResult> {
  if (!(await shouldSendEmail(params.candidateEmail, "application_updates"))) {
    return { skipped: true, reason: "email_preference_disabled" };
  }
  const data = await sendEmail({
    to: params.candidateEmail,
    subject: `Update on your application: ${params.jobTitle}`,
    html: pipelineStageUpdateHtml(params),
  });
  return { skipped: false, data };
}

export async function sendApplicationStatusUpdate(params: {
  candidateEmail: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  status: "shortlisted" | "in_progress" | "hired" | "rejected";
}): Promise<SendResult> {
  if (!(await shouldSendEmail(params.candidateEmail, "application_updates"))) {
    return { skipped: true, reason: "email_preference_disabled" };
  }
  const subject =
    params.status === "shortlisted"
      ? `You've been shortlisted: ${params.jobTitle}`
      : params.status === "hired"
        ? `You've been hired: ${params.jobTitle}`
        : `Update on your application: ${params.jobTitle}`;
  const data = await sendEmail({
    to: params.candidateEmail,
    subject,
    html: applicationStatusUpdateHtml(params),
  });
  return { skipped: false, data };
}

export async function sendApplicationWithdrawnToRecruiter(params: {
  recruiterEmail: string;
  candidateName: string;
  jobTitle: string;
}): Promise<SendResult> {
  if (!(await shouldSendEmail(params.recruiterEmail, "application_updates"))) {
    return { skipped: true, reason: "email_preference_disabled" };
  }
  const data = await sendEmail({
    to: params.recruiterEmail,
    subject: `Application withdrawn: ${params.candidateName} – ${params.jobTitle}`,
    html: applicationWithdrawnHtml(params),
  });
  return { skipped: false, data };
}

export async function sendInterviewBooked(params: {
  candidateEmail: string;
  candidateName: string;
  jobTitle: string;
  interviewDate: string;
  interviewTime: string;
  timezone: string;
  /** Recording disclosure sentence, when the org's AI notetaker is enabled. (#354) */
  recordingNotice?: string | null;
}): Promise<SendResult> {
  if (!(await shouldSendEmail(params.candidateEmail, "interview_reminders"))) {
    return { skipped: true, reason: "email_preference_disabled" };
  }
  const data = await sendEmail({
    to: params.candidateEmail,
    subject: `Interview scheduled: ${params.jobTitle}`,
    html: interviewBookedHtml(params),
  });
  return { skipped: false, data };
}

export async function sendInterviewCancelled(params: {
  recipientEmail: string;
  recipientName: string;
  jobTitle: string;
  originalDate: string;
}): Promise<SendResult> {
  if (!(await shouldSendEmail(params.recipientEmail, "interview_reminders"))) {
    return { skipped: true, reason: "email_preference_disabled" };
  }
  const data = await sendEmail({
    to: params.recipientEmail,
    subject: `Interview cancelled: ${params.jobTitle}`,
    html: interviewCancelledHtml(params),
  });
  return { skipped: false, data };
}

export async function sendInterviewRescheduled(params: {
  recipientEmail: string;
  recipientName: string;
  jobTitle: string;
  oldDate: string;
  newDate: string;
  newTime: string;
  timezone: string;
}): Promise<SendResult> {
  if (!(await shouldSendEmail(params.recipientEmail, "interview_reminders"))) {
    return { skipped: true, reason: "email_preference_disabled" };
  }
  const data = await sendEmail({
    to: params.recipientEmail,
    subject: `Interview rescheduled: ${params.jobTitle}`,
    html: interviewRescheduledHtml(params),
  });
  return { skipped: false, data };
}

export async function sendInterviewReminder(params: {
  recipientEmail: string;
  recipientName: string;
  jobTitle: string;
  interviewDate: string;
  interviewTime: string;
  timezone: string;
}): Promise<SendResult> {
  if (!(await shouldSendEmail(params.recipientEmail, "interview_reminders"))) {
    return { skipped: true, reason: "email_preference_disabled" };
  }
  const data = await sendEmail({
    to: params.recipientEmail,
    subject: `Reminder: Interview for ${params.jobTitle} tomorrow`,
    html: interviewReminderHtml(params),
  });
  return { skipped: false, data };
}

export async function sendApplicationConfirmation(params: {
  candidateEmail: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
}): Promise<SendResult> {
  if (!(await shouldSendEmail(params.candidateEmail, "application_updates"))) {
    return { skipped: true, reason: "email_preference_disabled" };
  }
  const data = await sendEmail({
    to: params.candidateEmail,
    subject: `Application received: ${params.jobTitle} at ${params.companyName}`,
    html: applicationConfirmationHtml(params),
  });
  return { skipped: false, data };
}

export async function sendEmailIntakeAcknowledgement(params: {
  candidateEmail: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
}): Promise<SendResult> {
  if (!(await shouldSendEmail(params.candidateEmail, "application_updates"))) {
    return { skipped: true, reason: "email_preference_disabled" };
  }
  const data = await sendEmail({
    to: params.candidateEmail,
    subject: `Profile received: ${params.jobTitle} at ${params.companyName}`,
    html: emailIntakeAcknowledgementHtml(params),
  });
  return { skipped: false, data };
}

export async function sendJobClosedCandidateNotice(params: {
  candidateEmail: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
}): Promise<SendResult> {
  if (!(await shouldSendEmail(params.candidateEmail, "application_updates"))) {
    return { skipped: true, reason: "email_preference_disabled" };
  }
  const data = await sendEmail({
    to: params.candidateEmail,
    subject: `Role closed: ${params.jobTitle}`,
    html: jobClosedCandidateHtml(params),
  });
  return { skipped: false, data };
}

export async function sendJobClosedReferrerNotice(params: {
  referrerEmail: string;
  referrerName: string;
  jobTitle: string;
  companyName: string;
}): Promise<SendResult> {
  if (!(await shouldSendEmail(params.referrerEmail, "application_updates"))) {
    return { skipped: true, reason: "email_preference_disabled" };
  }
  const data = await sendEmail({
    to: params.referrerEmail,
    subject: `Referral role closed: ${params.jobTitle}`,
    html: jobClosedReferrerHtml(params),
  });
  return { skipped: false, data };
}

export async function sendContactNotification(params: {
  name: string;
  email: string;
  company: string;
  type: string;
  message: string;
}) {
  return sendEmail({
    to: "hello@tigerhire.io",
    subject: `[TigerHire Contact] ${params.type}: ${params.name}`,
    html: contactNotificationHtml(params),
    replyTo: params.email,
  });
}

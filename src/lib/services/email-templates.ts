import { env } from "@/lib/config/env";
import { WHATSAPP_CV_DROP_LINK } from "@/lib/config/whatsapp";

/** Matches app `--accent` in globals.css (amber) — not tailwind `orange-500` */
const BRAND = "#f59e0b";
const BRAND_DEEP = "#d97706";
const TEXT_PRIMARY = "#1f2937";
const TEXT_SECONDARY = "#6b7280";
const BG_MUTED = "#f3f4f6";
const BRAND_SHADOW = "0 2px 8px rgba(245, 158, 11, 0.32)";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ctaButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;padding:12px 24px;background:${BRAND};color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;box-shadow:${BRAND_SHADOW};border:1px solid ${BRAND_DEEP};">${label}</a>`;
}

function infoBox(content: string): string {
  return `<div style="background:${BG_MUTED};padding:16px;border-radius:8px;margin:16px 0;">${content}</div>`;
}

interface LayoutOptions {
  body: string;
  showUnsubscribe?: boolean;
  /** Invisible preheader (improves inbox preview next to subject). */
  preheader?: string;
}

function emailBrandHeader(): string {
  const src = env.emailBrandingLogoUrl;
  if (src) {
    return `<div style="text-align:center;margin-bottom:20px;">
      <img src="${escapeHtml(src)}" alt="TigerHire" width="168" height="48" border="0" style="max-width:180px;height:auto;display:block;margin:0 auto;" />
    </div>`;
  }
  return `<div style="text-align:center;margin-bottom:24px;">
    <span style="font-size:24px;font-weight:700;color:${TEXT_PRIMARY};">Tiger<span style="color:${BRAND};">Hire</span></span>
  </div>`;
}

export function emailLayout({ body, showUnsubscribe = true, preheader }: LayoutOptions): string {
  const preheaderBlock = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#fafafa;">${escapeHtml(
        preheader,
      )}</div>`
    : "";

  const unsubscribeBlock = showUnsubscribe
    ? `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:${TEXT_SECONDARY};text-align:center;">
        <p style="margin:0;">TigerHire &middot; AI-powered recruitment</p>
        <p style="margin:8px 0 0;"><a href="${WHATSAPP_CV_DROP_LINK}" style="color:#25D366;text-decoration:none;font-weight:600;">💬 Drop your CV on WhatsApp for fast matching</a></p>
        <p style="margin:4px 0 0;"><a href="${env.baseUrl}/api/email-preferences" style="color:${TEXT_SECONDARY};text-decoration:underline;">Manage email preferences</a></p>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    ${preheaderBlock}
    ${emailBrandHeader()}
    <div style="background:#fff;border-radius:12px;padding:0 0 1px;overflow:hidden;border:1px solid #e5e7eb;border-top:4px solid ${BRAND};box-shadow:0 1px 2px rgba(0,0,0,0.04);">
      <div style="padding:28px 24px 32px;color:${TEXT_PRIMARY};font-size:15px;line-height:1.65;">
      ${body}
      </div>
    </div>
    ${unsubscribeBlock}
  </div>
</body>
</html>`;
}

export function matchAlertHtml(p: {
  candidateName: string;
  matchCount: number;
  topRole: string;
  topCompany: string;
}): string {
  return emailLayout({
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">Hey ${p.candidateName} 🐯</h2>
      <p>Great news — <strong>${p.matchCount} companies</strong> on TigerHire are actively hiring for roles that match your profile.</p>
      <p>Top match: <strong>${p.topRole}</strong> at <strong>${p.topCompany}</strong></p>
      ${ctaButton(`${env.baseUrl}/candidate`, "View Your Matches")}
      <p style="margin-top:16px;font-size:13px;color:${TEXT_SECONDARY};">Or <a href="${WHATSAPP_CV_DROP_LINK}" style="color:#25D366;font-weight:600;">send your updated CV on WhatsApp</a> for fast re-scoring.</p>
    `,
  });
}

export function fitScoreReadyHtml(p: {
  candidateCount: number;
  roleName: string;
  topScore: number;
}): string {
  return emailLayout({
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">Your FitScore shortlist is ready 🎯</h2>
      <p><strong>${p.candidateCount} candidates</strong> scored for <strong>${p.roleName}</strong>.</p>
      <p>Top candidate score: <strong>${p.topScore}/100</strong></p>
      ${ctaButton(`${env.baseUrl}/recruit`, "View Shortlist")}
    `,
  });
}

export function inviteHtml(p: {
  inviterName: string;
  organisationName: string;
  token: string;
}): string {
  return emailLayout({
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">You're invited 🐯</h2>
      <p><strong>${p.inviterName}</strong> invited you to join <strong>${p.organisationName}</strong> on TigerHire.</p>
      ${ctaButton(`${env.baseUrl}/invite/${p.token}`, "Accept Invite")}
      <p style="margin-top:16px;font-size:13px;color:${TEXT_SECONDARY};">This invite expires in 7 days.</p>
    `,
    showUnsubscribe: false,
  });
}

export function applicationWithdrawnHtml(p: { candidateName: string; jobTitle: string }): string {
  return emailLayout({
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">Application withdrawn</h2>
      <p><strong>${p.candidateName}</strong> withdrew their application for <strong>${p.jobTitle}</strong>.</p>
      ${ctaButton(`${env.baseUrl}/recruit/applications`, "View Applications")}
    `,
  });
}

export function interviewBookedHtml(p: {
  candidateName: string;
  jobTitle: string;
  interviewDate: string;
  interviewTime: string;
  timezone: string;
  recordingNotice?: string | null;
  meetingUrl?: string | null;
}): string {
  return emailLayout({
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">Interview Confirmed</h2>
      <p>Hi ${p.candidateName},</p>
      <p>Your interview for <strong>${p.jobTitle}</strong> has been scheduled.</p>
      ${infoBox(`
        <p style="margin:0;"><strong>Date:</strong> ${p.interviewDate}</p>
        <p style="margin:4px 0 0;"><strong>Time:</strong> ${p.interviewTime} (${p.timezone})</p>
        ${p.meetingUrl ? `<p style="margin:4px 0 0;"><strong>Join:</strong> <a href="${p.meetingUrl}">${p.meetingUrl}</a></p>` : ""}
      `)}
      ${ctaButton(`${env.baseUrl}/candidate`, "View Details")}
      <p style="margin-top:16px;font-size:13px;color:${TEXT_SECONDARY};">If you need to reschedule, please contact your recruiter.</p>
      ${p.recordingNotice ? `<p style="margin-top:12px;font-size:13px;color:${TEXT_SECONDARY};">${p.recordingNotice}</p>` : ""}
    `,
  });
}

export function interviewCancelledHtml(p: {
  recipientName: string;
  jobTitle: string;
  originalDate: string;
}): string {
  return emailLayout({
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">Interview Cancelled</h2>
      <p>Hi ${p.recipientName},</p>
      <p>The interview for <strong>${p.jobTitle}</strong> originally scheduled for <strong>${p.originalDate}</strong> has been cancelled.</p>
      <p>Your recruiter will reach out if a new time is needed.</p>
      ${ctaButton(`${env.baseUrl}/candidate`, "View Dashboard")}
    `,
  });
}

export function interviewRescheduledHtml(p: {
  recipientName: string;
  jobTitle: string;
  oldDate: string;
  newDate: string;
  newTime: string;
  timezone: string;
}): string {
  return emailLayout({
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">Interview Rescheduled</h2>
      <p>Hi ${p.recipientName},</p>
      <p>Your interview for <strong>${p.jobTitle}</strong> has been rescheduled.</p>
      ${infoBox(`
        <p style="margin:0;text-decoration:line-through;color:#999;"><strong>Previous:</strong> ${p.oldDate}</p>
        <p style="margin:8px 0 0;"><strong>New date:</strong> ${p.newDate}</p>
        <p style="margin:4px 0 0;"><strong>New time:</strong> ${p.newTime} (${p.timezone})</p>
      `)}
      ${ctaButton(`${env.baseUrl}/candidate`, "View Details")}
    `,
  });
}

export function interviewReminderHtml(p: {
  recipientName: string;
  jobTitle: string;
  interviewDate: string;
  interviewTime: string;
  timezone: string;
}): string {
  return emailLayout({
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">Interview Reminder</h2>
      <p>Hi ${p.recipientName},</p>
      <p>This is a reminder that you have an interview scheduled for <strong>${p.jobTitle}</strong>.</p>
      ${infoBox(`
        <p style="margin:0;"><strong>Date:</strong> ${p.interviewDate}</p>
        <p style="margin:4px 0 0;"><strong>Time:</strong> ${p.interviewTime} (${p.timezone})</p>
      `)}
      <p>Please make sure you're prepared and available at the scheduled time.</p>
      ${ctaButton(`${env.baseUrl}/candidate`, "View Details")}
    `,
  });
}

export function applicationConfirmationHtml(p: {
  candidateName: string;
  jobTitle: string;
  companyName: string;
}): string {
  return emailLayout({
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">Application Received</h2>
      <p>Hi ${p.candidateName},</p>
      <p>We've received your application for <strong>${p.jobTitle}</strong> at <strong>${p.companyName}</strong>.</p>
      ${infoBox(`
        <p style="margin:0;"><strong>What happens next?</strong></p>
        <p style="margin:4px 0 0;">The hiring team will review your profile and FitScore. You'll be notified when there's an update on your application.</p>
      `)}
      <p>You can track your application status anytime from your dashboard.</p>
      ${ctaButton(`${env.baseUrl}/candidate/applications`, "View My Applications")}
    `,
  });
}

export function emailIntakeAcknowledgementHtml(p: {
  candidateName: string;
  jobTitle: string;
  companyName: string;
}): string {
  return emailLayout({
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">Profile Received</h2>
      <p>Hi ${p.candidateName},</p>
      <p>We received your profile by email for <strong>${p.jobTitle}</strong> at <strong>${p.companyName}</strong>.</p>
      ${infoBox(`
        <p style="margin:0;"><strong>What happens next?</strong></p>
        <p style="margin:4px 0 0;">The hiring team will review your profile and you will get an update if there is a fit.</p>
      `)}
      <p>If this was shared in error, reply to this email and we will help you opt out.</p>
      ${ctaButton(`${env.baseUrl}/candidate/applications`, "View My Applications")}
    `,
  });
}

const STATUS_LABELS: Record<string, string> = {
  shortlisted: "shortlisted",
  in_progress: "moved forward",
  hired: "hired",
  rejected: "not moving forward",
};

function stageNotificationExtraHtml(
  customMessage: string | null | undefined,
  vars: { candidateName: string; jobTitle: string; companyName: string; stageName: string },
): string {
  const trimmed = customMessage?.trim();
  if (!trimmed) return "";

  const resolved = trimmed
    .replaceAll("{candidateName}", vars.candidateName)
    .replaceAll("{jobTitle}", vars.jobTitle)
    .replaceAll("{companyName}", vars.companyName)
    .replaceAll("{stageName}", vars.stageName);
  const safe = escapeHtml(resolved).replace(/\r?\n/g, "<br/>");
  return `<div style="margin-top:16px;">${safe}</div>`;
}

export function pipelineStageUpdateHtml(p: {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  stageName: string;
  customBodyHtml?: string | null;
}): string {
  const safeName = escapeHtml(p.candidateName);
  const safeJob = escapeHtml(p.jobTitle);
  const safeCompany = escapeHtml(p.companyName);
  const safeStage = escapeHtml(p.stageName);
  const extra = stageNotificationExtraHtml(p.customBodyHtml, p);
  return emailLayout({
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">Application update</h2>
      <p>Hi ${safeName},</p>
      <p>Your application for <strong>${safeJob}</strong> at <strong>${safeCompany}</strong> has been updated.</p>
      <p>You are now at the <strong>${safeStage}</strong> stage.</p>
      ${extra}
      ${ctaButton(`${env.baseUrl}/candidate`, "View dashboard")}
    `,
  });
}

export function applicationStatusUpdateHtml(p: {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  status: string;
}): string {
  const label = STATUS_LABELS[p.status] ?? p.status;
  const isPositive = ["shortlisted", "in_progress", "hired"].includes(p.status);
  const headline = isPositive
    ? `Update on your application for ${p.jobTitle}`
    : `Update on your application for ${p.jobTitle}`;
  const message =
    p.status === "shortlisted"
      ? `Congratulations! You've been shortlisted for <strong>${p.jobTitle}</strong> at <strong>${p.companyName}</strong>.`
      : p.status === "hired"
        ? `Great news! You've been selected for <strong>${p.jobTitle}</strong> at <strong>${p.companyName}</strong>.`
        : p.status === "rejected"
          ? `Thank you for your interest in <strong>${p.jobTitle}</strong> at <strong>${p.companyName}</strong>. We've decided to move forward with other candidates at this time.`
          : `Your application for <strong>${p.jobTitle}</strong> at <strong>${p.companyName}</strong> has been ${label}.`;

  return emailLayout({
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">${headline}</h2>
      <p>Hi ${p.candidateName},</p>
      <p>${message}</p>
      ${ctaButton(`${env.baseUrl}/candidate`, "View Dashboard")}
    `,
  });
}

export function jobClosedCandidateHtml(p: {
  candidateName: string;
  jobTitle: string;
  companyName: string;
}): string {
  return emailLayout({
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">Role closed</h2>
      <p>Hi ${escapeHtml(p.candidateName)},</p>
      <p><strong>${escapeHtml(p.jobTitle)}</strong> at <strong>${escapeHtml(p.companyName)}</strong> is now closed and is no longer accepting applications.</p>
      <p>Your profile stays active for other matching opportunities on TigerHire.</p>
      ${ctaButton(`${env.baseUrl}/candidate/jobs`, "Browse other open roles")}
    `,
  });
}

export function jobClosedReferrerHtml(p: {
  referrerName: string;
  jobTitle: string;
  companyName: string;
}): string {
  return emailLayout({
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">Referral role closed</h2>
      <p>Hi ${escapeHtml(p.referrerName)},</p>
      <p><strong>${escapeHtml(p.jobTitle)}</strong> at <strong>${escapeHtml(p.companyName)}</strong> is now closed.</p>
      <p>Your existing referral link for this role is no longer active for new applications. You can continue sharing links for other open roles.</p>
      ${ctaButton(`${env.baseUrl}/dashboard/referrer`, "Open Refer & Earn")}
    `,
  });
}

export function contactNotificationHtml(p: {
  name: string;
  email: string;
  company: string;
  type: string;
  message: string;
}): string {
  return emailLayout({
    body: `
      <h3 style="margin:0 0 16px;font-size:18px;">New Contact Submission</h3>
      <p><strong>Name:</strong> ${p.name}</p>
      <p><strong>Email:</strong> ${p.email}</p>
      <p><strong>Company:</strong> ${p.company || "N/A"}</p>
      <p><strong>Type:</strong> ${p.type}</p>
      <p><strong>Message:</strong></p>
      <blockquote style="border-left:3px solid ${BRAND};padding-left:12px;color:#555;margin:8px 0;">${p.message}</blockquote>
    `,
    showUnsubscribe: false,
  });
}

/** Candidate: link to review and sign (no external e-sign). */
export function offerNativeSigningInviteCandidateHtml(p: {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  signingUrl: string;
}): string {
  const name = escapeHtml(p.candidateName);
  const job = escapeHtml(p.jobTitle);
  const company = escapeHtml(p.companyName);
  return emailLayout({
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">Your offer from ${company}</h2>
      <p>Hi ${name},</p>
      <p>You have received an offer for <strong>${job}</strong>. Review the full letter and accept it securely in one step — no extra accounts required.</p>
      ${ctaButton(escapeHtml(p.signingUrl), "Review and sign your offer")}
      <p style="margin:16px 0 0;font-size:13px;color:${TEXT_SECONDARY};">This link is private to you. If it expires, contact ${company} for a new link.</p>
    `,
  });
}

/** Company signer: first-signature request before candidate countersign. */
export function offerNativeSigningInviteCompanyHtml(p: {
  signerName: string;
  jobTitle: string;
  companyName: string;
  signingUrl: string;
}): string {
  const name = escapeHtml(p.signerName);
  const job = escapeHtml(p.jobTitle);
  const company = escapeHtml(p.companyName);
  return emailLayout({
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">Company signature required</h2>
      <p>Hi ${name},</p>
      <p>You were assigned as the company representative signer for <strong>${job}</strong> at <strong>${company}</strong>.</p>
      <p>Please review and sign this offer. Once completed, the candidate link will be activated automatically.</p>
      ${ctaButton(escapeHtml(p.signingUrl), "Review and sign as company")}
    `,
  });
}

/** Recruiter: confirmation that the offer email was dispatched. */
export function offerNativeOfferSentRecruiterHtml(p: {
  recruiterName?: string | null;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  companyOffersUrl: string;
}): string {
  const greet = escapeHtml((p.recruiterName ?? "").trim() || "there");
  const cand = escapeHtml(p.candidateName);
  const job = escapeHtml(p.jobTitle);
  const company = escapeHtml(p.companyName);
  return emailLayout({
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">Offer sent</h2>
      <p>Hi ${greet},</p>
      <p>Your offer for <strong>${job}</strong> was sent to <strong>${cand}</strong> at <strong>${company}</strong>. You will be notified when they sign.</p>
      ${ctaButton(escapeHtml(p.companyOffersUrl), "View offers")}
    `,
  });
}

/** Candidate: signed confirmation (PDF attached separately). */
export function offerNativeSignedCandidateConfirmationHtml(p: {
  candidateName: string;
  jobTitle: string;
  companyName: string;
}): string {
  const name = escapeHtml(p.candidateName);
  const job = escapeHtml(p.jobTitle);
  const company = escapeHtml(p.companyName);
  return emailLayout({
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">Your offer letter is confirmed</h2>
      <p>Hi ${name},</p>
      <p>Thank you for accepting. Your signed offer for <strong>${job}</strong> at <strong>${company}</strong> is attached to this email as a PDF.</p>
      <p style="font-size:13px;color:${TEXT_SECONDARY};">Keep this copy for your records.</p>
    `,
  });
}

/** Recruiter: candidate accepted (PDF attached separately). */
export function offerNativeSignedHrConfirmationHtml(p: {
  hrName?: string | null;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  companyOffersUrl: string;
}): string {
  const greet = escapeHtml((p.hrName ?? "").trim() || "there");
  const cand = escapeHtml(p.candidateName);
  const job = escapeHtml(p.jobTitle);
  const company = escapeHtml(p.companyName);
  return emailLayout({
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">${cand} has accepted the offer</h2>
      <p>Hi ${greet},</p>
      <p><strong>${cand}</strong> accepted the offer for <strong>${job}</strong> at <strong>${company}</strong>. The signed PDF is attached.</p>
      ${ctaButton(escapeHtml(p.companyOffersUrl), "View offers")}
    `,
  });
}

export function offerNativeSigningReminderCandidateHtml(p: {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  signingUrl: string;
  hoursRemaining: number;
}): string {
  const name = escapeHtml(p.candidateName);
  const job = escapeHtml(p.jobTitle);
  const company = escapeHtml(p.companyName);
  const h = Math.max(1, Math.round(p.hoursRemaining));
  return emailLayout({
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">Reminder: your offer expires soon</h2>
      <p>Hi ${name},</p>
      <p>Your offer for <strong>${job}</strong> at <strong>${company}</strong> expires in about <strong>${h}</strong> hours. Please review and sign to avoid missing out.</p>
      ${ctaButton(escapeHtml(p.signingUrl), "Review and sign your offer")}
    `,
  });
}

export function offerNativeExpiredRecruiterHtml(p: {
  recruiterName?: string | null;
  candidateName: string;
  jobTitle: string;
  companyOffersUrl: string;
}): string {
  const greet = escapeHtml((p.recruiterName ?? "").trim() || "there");
  const cand = escapeHtml(p.candidateName);
  const job = escapeHtml(p.jobTitle);
  return emailLayout({
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">Offer expired</h2>
      <p>Hi ${greet},</p>
      <p>The offer to <strong>${cand}</strong> for <strong>${job}</strong> expired without a response.</p>
      ${ctaButton(escapeHtml(p.companyOffersUrl), "View offers")}
    `,
  });
}

export function offerNativeWithdrawnCandidateHtml(p: {
  candidateName: string;
  jobTitle: string;
  companyName: string;
}): string {
  const name = escapeHtml(p.candidateName);
  const job = escapeHtml(p.jobTitle);
  const company = escapeHtml(p.companyName);
  return emailLayout({
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">Offer withdrawn</h2>
      <p>Hi ${name},</p>
      <p><strong>${company}</strong> has withdrawn the offer for <strong>${job}</strong>. If you have questions, please contact the hiring team directly.</p>
    `,
  });
}

export function offerNativeDeclinedRecruiterHtml(p: {
  recruiterName?: string | null;
  candidateName: string;
  jobTitle: string;
  reason?: string | null;
  companyOffersUrl: string;
}): string {
  const greet = escapeHtml((p.recruiterName ?? "").trim() || "there");
  const cand = escapeHtml(p.candidateName);
  const job = escapeHtml(p.jobTitle);
  const reasonBlock =
    p.reason && p.reason.trim().length > 0
      ? `<p style="margin:12px 0 0;"><strong>Reason (optional):</strong><br/><span style="color:${TEXT_PRIMARY};">${escapeHtml(p.reason.trim())}</span></p>`
      : "";
  return emailLayout({
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">Offer declined</h2>
      <p>Hi ${greet},</p>
      <p><strong>${cand}</strong> has declined the offer for <strong>${job}</strong>.</p>
      ${reasonBlock}
      ${ctaButton(escapeHtml(p.companyOffersUrl), "View offers")}
    `,
  });
}

/** In-app direct message: recipient notification. */
export function newInboxMessageNotificationHtml(p: {
  recipientName?: string;
  senderName: string;
  messagePreview: string;
  threadUrl: string;
}): string {
  const greet = escapeHtml((p.recipientName ?? "").trim() || "there");
  const sender = escapeHtml(p.senderName);
  const preview = escapeHtml(p.messagePreview);
  return emailLayout({
    preheader: `${p.senderName} sent you a message on TigerHire`,
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">You have a new message</h2>
      <p>Hi ${greet},</p>
      <p><strong>${sender}</strong> sent you a message in your TigerHire inbox.</p>
      <blockquote style="border-left:3px solid ${BRAND};padding:12px 12px 12px 16px;margin:20px 0;background:${BG_MUTED};border-radius:0 8px 8px 0;font-size:14px;color:#374151;">${preview}</blockquote>
      <p>Reply in-app to keep the full history in one place.</p>
      ${ctaButton(escapeHtml(p.threadUrl), "Open conversation")}
    `,
  });
}

export function savedSearchJobAlertHtml(p: {
  name: string;
  searchName: string;
  jobCount: number;
  jobs: Array<{
    title: string;
    company: string;
    location: string;
    remoteOk: boolean;
  }>;
}): string {
  const items = p.jobs
    .map(
      (
        j,
      ) => `<li style="margin:0 0 12px;padding:14px 16px;border:1px solid #e5e7eb;border-radius:8px;background:${BG_MUTED};">
        <p style="margin:0;font-weight:600;">${escapeHtml(j.title)}</p>
        <p style="margin:6px 0 0;font-size:14px;color:${TEXT_SECONDARY};">${escapeHtml(j.company)} &middot; ${escapeHtml(j.location)}${
          j.remoteOk ? " (Remote OK)" : ""
        }</p>
      </li>`,
    )
    .join("");
  return emailLayout({
    preheader: `${p.jobCount} new job(s) for "${p.searchName}" on TigerHire`,
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">New jobs for you</h2>
      <p>Hi ${escapeHtml(p.name)},</p>
      <p>We found <strong>${p.jobCount}</strong> new role${p.jobCount === 1 ? "" : "s"} that match your saved search <strong>${escapeHtml(p.searchName)}</strong>.</p>
      <p style="font-size:14px;color:${TEXT_SECONDARY};">You are receiving this because you enabled alerts for this search. You can change frequency or turn alerts off in settings.</p>
      <ul style="list-style:none;padding:0;margin:20px 0 0;">${items}</ul>
      ${ctaButton(`${env.baseUrl}/candidate/jobs`, "View all matching jobs")}
      <p style="margin-top:24px;font-size:13px;text-align:center;"><a href="${env.baseUrl}/candidate/settings" style="color:${TEXT_SECONDARY};">Alert preferences</a></p>
    `,
  });
}

export function assessmentShareInviteEmailHtml(p: {
  recipientName: string;
  assessmentTitle: string;
  shareUrl: string;
  shareToken: string;
  deadlineLabel: string;
}): string {
  const who = escapeHtml(p.recipientName);
  const title = escapeHtml(p.assessmentTitle);
  const sampleCmd = `SUBMIT ${p.shareToken} <your link or text>`;
  return emailLayout({
    preheader: `Your assessment: ${p.assessmentTitle}`,
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">Your assessment is ready</h2>
      <p>Hi ${who},</p>
      <p>Your assigned assessment is <strong>${title}</strong>. You can start or continue anytime using the link below. Complete it before the deadline so the team can review your work on time.</p>
      ${infoBox(
        `<p style="margin:0;"><strong>Submit by</strong> ${escapeHtml(p.deadlineLabel)}</p><p style="margin:8px 0 0;font-size:13px;color:${TEXT_SECONDARY};">If you need a different date, contact the recruiter who sent this link.</p>`,
      )}
      ${ctaButton(escapeHtml(p.shareUrl), "Open assessment")}
      <p style="margin:20px 0 0;font-size:14px;">Using WhatsApp? Copy this line as a single message:</p>
      <p style="margin:8px 0 0;"><code style="font-size:12px;background:${BG_MUTED};padding:8px 10px;border-radius:6px;display:block;word-break:break-all;">${escapeHtml(
        sampleCmd,
      )}</code></p>
    `,
  });
}

export function selfScheduleInviteEmailHtml(p: {
  recipientName: string;
  jobTitle: string;
  companyName: string;
  scheduleUrl: string;
  expiresLabel: string;
}): string {
  const who = escapeHtml(p.recipientName);
  const role = escapeHtml(p.jobTitle);
  const company = escapeHtml(p.companyName);
  return emailLayout({
    preheader: `Choose a time for your ${p.jobTitle} interview`,
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">Choose your interview time</h2>
      <p>Hi ${who},</p>
      <p><strong>${company}</strong> invited you to schedule an interview for <strong>${role}</strong>. Open the link below, confirm your name, and pick an available slot. Times appear in your local timezone.</p>
      ${infoBox(
        `<p style="margin:0;"><strong>Link expires</strong> ${escapeHtml(p.expiresLabel)}</p><p style="margin:8px 0 0;font-size:13px;color:${TEXT_SECONDARY};">If none of the times work, reply to the recruiter who contacted you.</p>`,
      )}
      ${ctaButton(escapeHtml(p.scheduleUrl), "Pick a time")}
      <p style="margin:20px 0 0;font-size:13px;color:${TEXT_SECONDARY};word-break:break-all;">Or copy this link: ${escapeHtml(p.scheduleUrl)}</p>
    `,
  });
}

export function orchestratorShortlistOpportunityHtml(p: {
  candidateName: string;
  roleTitle: string;
  orgName: string;
}): string {
  const c = escapeHtml(p.candidateName);
  const r = escapeHtml(p.roleTitle);
  const o = escapeHtml(p.orgName);
  return emailLayout({
    preheader: `Interview next steps: ${p.roleTitle} at ${p.orgName}`,
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">You’re shortlisted</h2>
      <p>Hi ${c},</p>
      <p>We’ve reviewed your application and you’re shortlisted for the <strong>${r}</strong> position at <strong>${o}</strong>. We’re moving forward and will coordinate interview next steps with you.</p>
      <p>We also sent a WhatsApp message to the number on your profile, if you have one on file — check there for quick follow-ups, or use your TigerHire inbox so nothing gets lost.</p>
      ${infoBox(
        `<p style="margin:0;"><strong>What’s next</strong></p><p style="margin:6px 0 0;">Watch for a message from the team with interview time options, or check your applications dashboard for updates.</p>`,
      )}
      ${ctaButton(`${env.baseUrl}/candidate`, "View your applications")}
    `,
  });
}

export function orchestratorHiredCongratulationHtml(p: {
  candidateName: string;
  jobTitle: string;
  companyName: string;
}): string {
  const c = escapeHtml(p.candidateName);
  const j = escapeHtml(p.jobTitle);
  const co = escapeHtml(p.companyName);
  return emailLayout({
    preheader: `Congratulations on ${p.jobTitle} at ${p.companyName}`,
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">Congratulations</h2>
      <p>Hi ${c},</p>
      <p>We’re pleased to let you know you’ve been selected for the <strong>${j}</strong> role with <strong>${co}</strong>. We’re proud to help connect the right people with the right team.</p>
      <p>Someone from the hiring team will follow up with offer details, paperwork, and onboarding next steps. If you have an urgent question, you can also reply to this email if your system allows, or use your TigerHire thread.</p>
      ${infoBox(
        `<p style="margin:0;"><strong>Pro tip</strong></p><p style="margin:6px 0 0;">Keep an eye on your email and in-app notifications in the next few business days for formal paperwork.</p>`,
      )}
      ${ctaButton(`${env.baseUrl}/candidate`, "Open dashboard")}
    `,
  });
}

export function orchestratorRejectionUpdateHtml(p: {
  candidateName: string;
  jobTitle: string;
  companyName: string;
}): string {
  const c = escapeHtml(p.candidateName);
  const j = escapeHtml(p.jobTitle);
  const co = escapeHtml(p.companyName);
  return emailLayout({
    preheader: `Update on your application: ${p.jobTitle}`,
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">An update on your application</h2>
      <p>Hi ${c},</p>
      <p>Thank you for your time and for applying to <strong>${j}</strong> at <strong>${co}</strong>. After a careful review, the team is moving forward with other candidates for this specific opening.</p>
      <p>That outcome doesn’t reflect the full value of your experience — we’d love to see you apply to other roles that may be a better fit. Your profile stays on TigerHire to match future opportunities.</p>
      ${ctaButton(`${env.baseUrl}/candidate/jobs`, "Browse open roles")}
    `,
  });
}

export function interviewerSelfScheduleBookedHtml(p: {
  stageName: string;
  jobTitle: string;
  candidateName: string;
  whenLabel: string;
  recruitInterviewsUrl: string;
}): string {
  return emailLayout({
    preheader: `${p.candidateName} booked a ${p.stageName} for ${p.jobTitle}`,
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">New interview on your calendar</h2>
      <p>Hi there,</p>
      <p><strong>${escapeHtml(p.candidateName)}</strong> has booked a <strong>${escapeHtml(
        p.stageName,
      )}</strong> for <strong>${escapeHtml(p.jobTitle)}</strong> using a self-schedule link.</p>
      ${infoBox(
        `<p style="margin:0;"><strong>When</strong></p><p style="margin:4px 0 0;">${escapeHtml(
          p.whenLabel,
        )}</p>`,
      )}
      <p>An <strong>interview.ics</strong> calendar file is attached to this email. Add it to your calendar if it isn’t already on your main schedule.</p>
      ${ctaButton(escapeHtml(p.recruitInterviewsUrl), "View in TigerHire")}
    `,
    showUnsubscribe: false,
  });
}

function internalTaskEmailHtml(p: {
  recipientName: string;
  heading: string;
  bodyLines: string[];
  tasksUrl: string;
  ctaLabel: string;
}): string {
  const lines = p.bodyLines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
  return emailLayout({
    preheader: p.heading,
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">${escapeHtml(p.heading)}</h2>
      <p>Hi ${escapeHtml(p.recipientName)},</p>
      ${lines}
      ${ctaButton(escapeHtml(p.tasksUrl), p.ctaLabel)}
    `,
    showUnsubscribe: false,
  });
}

export function pendingApprovalTaskEmailHtml(p: {
  recipientName: string;
  title: string;
  bodyLines: string[];
  tasksUrl: string;
}): string {
  return internalTaskEmailHtml({
    recipientName: p.recipientName,
    heading: p.title,
    bodyLines: p.bodyLines,
    tasksUrl: p.tasksUrl,
    ctaLabel: "Open tasks inbox",
  });
}

export function feedbackDueTaskEmailHtml(p: {
  recipientName: string;
  title: string;
  bodyLines: string[];
  tasksUrl: string;
}): string {
  return internalTaskEmailHtml({
    recipientName: p.recipientName,
    heading: p.title,
    bodyLines: p.bodyLines,
    tasksUrl: p.tasksUrl,
    ctaLabel: "Submit feedback",
  });
}

export function interviewConfirmedTaskEmailHtml(p: {
  recipientName: string;
  title: string;
  bodyLines: string[];
  tasksUrl: string;
}): string {
  return internalTaskEmailHtml({
    recipientName: p.recipientName,
    heading: p.title,
    bodyLines: p.bodyLines,
    tasksUrl: p.tasksUrl,
    ctaLabel: "View interview",
  });
}

export function interviewerFeedbackReminderHtml(p: {
  recipientName: string;
  candidateName: string;
  jobTitle: string;
  interviewAt: string;
  templateName: string;
  fields: Array<{ label: string; required?: boolean; description?: string }>;
  companyInterviewsUrl: string;
}): string {
  const items = p.fields
    .map(
      (field) =>
        `<li style="margin:0 0 10px;"><strong>${escapeHtml(field.label)}${
          field.required ? " (required)" : ""
        }</strong>${
          field.description
            ? `<br/><span style="font-size:14px;color:${TEXT_SECONDARY};line-height:1.5;">${escapeHtml(
                field.description,
              )}</span>`
            : ""
        }</li>`,
    )
    .join("");
  return emailLayout({
    preheader: `Please submit interview feedback: ${p.candidateName} — ${p.jobTitle}`,
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;">Interview feedback needed</h2>
      <p>Hi ${escapeHtml(p.recipientName)},</p>
      <p>The interview for <strong>${escapeHtml(p.candidateName)}</strong> for <strong>${escapeHtml(
        p.jobTitle,
      )}</strong> (${escapeHtml(
        p.interviewAt,
      )}) is complete, and the hiring team is waiting on your feedback before they can move this candidate in the process.</p>
      <p><strong>Template in use</strong> ${escapeHtml(
        p.templateName,
      )} — we’ve listed the fields so you can prepare quickly, then log in to submit the full form in TigerHire.</p>
      <p style="margin:16px 0 6px;font-weight:600;">Fields to cover</p>
      <ul style="margin:0 0 20px;padding:0 0 0 18px;">${items}</ul>
      ${ctaButton(escapeHtml(p.companyInterviewsUrl), "Open TigerHire and submit feedback")}
      <p style="margin-top:16px;font-size:13px;color:${TEXT_SECONDARY};">Takes a few minutes and helps the recruiter keep candidates moving without delays.</p>
    `,
    showUnsubscribe: false,
  });
}

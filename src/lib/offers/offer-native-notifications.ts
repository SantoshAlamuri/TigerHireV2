import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";
import { sendEmail, shouldSendEmail } from "@/lib/services/resend";
import {
  offerNativeDeclinedRecruiterHtml,
  offerNativeExpiredRecruiterHtml,
  offerNativeOfferSentRecruiterHtml,
  offerNativeSignedCandidateConfirmationHtml,
  offerNativeSignedHrConfirmationHtml,
  offerNativeSigningInviteCompanyHtml,
  offerNativeSigningInviteCandidateHtml,
  offerNativeSigningReminderCandidateHtml,
  offerNativeWithdrawnCandidateHtml,
} from "@/lib/services/email-templates";

export type OfferEmailDeliveryAttempt = {
  sent: boolean;
  skipped: boolean;
  reason: string | null;
  recipient: string | null;
  providerMessageId: string | null;
  error: string | null;
};

export type SignedOfferEmailDeliveryReceipt = {
  candidate: OfferEmailDeliveryAttempt;
  recruiter: OfferEmailDeliveryAttempt;
};

async function resolveRecruiterContact(
  admin: SupabaseClient,
  profileId: string,
): Promise<{ email: string | null; fullName: string | null }> {
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", profileId)
    .maybeSingle();

  const fullName = ((profile?.full_name as string | null) ?? "").trim() || null;

  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(profileId);
  if (authErr) {
    logger.warn("resolveRecruiterContact auth lookup failed", {
      profileId,
      error: authErr.message,
    });
    return { email: null, fullName };
  }

  const email = (authUser?.user?.email ?? "").trim() || null;
  return { email, fullName };
}

export async function sendNativeOfferSigningInviteEmail(params: {
  candidateEmail: string;
  candidateName: string;
  roleTitle: string;
  companyName: string;
  publicToken: string;
}): Promise<void> {
  const signingUrl = `${env.baseUrl}/offers/${params.publicToken}`;
  if (!(await shouldSendEmail(params.candidateEmail, "application_updates"))) return;
  try {
    await sendEmail({
      to: params.candidateEmail,
      subject: `Your offer from ${params.companyName} — ${params.roleTitle}`,
      html: offerNativeSigningInviteCandidateHtml({
        candidateName: params.candidateName,
        jobTitle: params.roleTitle,
        companyName: params.companyName,
        signingUrl,
      }),
    });
  } catch (e) {
    logger.warn("sendNativeOfferSigningInviteEmail failed", { error: String(e) });
  }
}

export async function sendNativeCompanySignerInviteEmail(params: {
  signerEmail: string;
  signerName: string;
  roleTitle: string;
  companyName: string;
  signingUrl: string;
}): Promise<void> {
  if (!(await shouldSendEmail(params.signerEmail, "application_updates"))) return;
  try {
    await sendEmail({
      to: params.signerEmail,
      subject: `Signature needed for ${params.roleTitle} — ${params.companyName}`,
      html: offerNativeSigningInviteCompanyHtml({
        signerName: params.signerName,
        jobTitle: params.roleTitle,
        companyName: params.companyName,
        signingUrl: params.signingUrl,
      }),
    });
  } catch (e) {
    logger.warn("sendNativeCompanySignerInviteEmail failed", { error: String(e) });
  }
}

export async function sendNativeOfferSentRecruiterEmail(
  admin: SupabaseClient,
  params: {
    createdByProfileId: string | null;
    candidateName: string;
    roleTitle: string;
    companyName: string;
  },
): Promise<void> {
  if (!params.createdByProfileId) return;
  const hr = await resolveRecruiterContact(admin, params.createdByProfileId);
  const hrEmail = hr.email ?? "";
  if (!hrEmail) return;
  if (!(await shouldSendEmail(hrEmail, "application_updates"))) return;
  try {
    await sendEmail({
      to: hrEmail,
      subject: `Offer sent to ${params.candidateName}`,
      html: offerNativeOfferSentRecruiterHtml({
        recruiterName: hr.fullName,
        candidateName: params.candidateName,
        jobTitle: params.roleTitle,
        companyName: params.companyName,
        companyOffersUrl: `${env.baseUrl}/company/offers`,
      }),
    });
  } catch (e) {
    logger.warn("sendNativeOfferSentRecruiterEmail failed", { error: String(e) });
  }
}

export async function sendNativeSignedOfferEmailsWithPdf(params: {
  admin: SupabaseClient;
  candidateEmail: string;
  candidateName: string;
  roleTitle: string;
  companyName: string;
  createdByProfileId: string | null;
  pdfBase64: string;
  pdfFilename: string;
}): Promise<SignedOfferEmailDeliveryReceipt> {
  const attachment = { filename: params.pdfFilename, content: params.pdfBase64 };
  const receipt: SignedOfferEmailDeliveryReceipt = {
    candidate: {
      sent: false,
      skipped: false,
      reason: null,
      recipient: params.candidateEmail || null,
      providerMessageId: null,
      error: null,
    },
    recruiter: {
      sent: false,
      skipped: false,
      reason: null,
      recipient: null,
      providerMessageId: null,
      error: null,
    },
  };

  if (!params.candidateEmail) {
    receipt.candidate.skipped = true;
    receipt.candidate.reason = "missing_candidate_email";
  } else if (!(await shouldSendEmail(params.candidateEmail, "application_updates"))) {
    receipt.candidate.skipped = true;
    receipt.candidate.reason = "candidate_email_preference_disabled";
  } else {
    try {
      const result = await sendEmail({
        to: params.candidateEmail,
        subject: `Your offer letter is confirmed — ${params.companyName} — ${params.roleTitle}`,
        html: offerNativeSignedCandidateConfirmationHtml({
          candidateName: params.candidateName,
          jobTitle: params.roleTitle,
          companyName: params.companyName,
        }),
        attachments: [attachment],
      });
      receipt.candidate.sent = !result.error;
      receipt.candidate.error = result.error ? String(result.error) : null;
      receipt.candidate.providerMessageId = (result.data as { id?: string } | null)?.id ?? null;
    } catch (e) {
      const err = String(e);
      receipt.candidate.error = err;
      logger.warn("sendNativeSignedOfferEmailsWithPdf: candidate failed", { error: err });
    }
  }

  if (!params.createdByProfileId) {
    receipt.recruiter.skipped = true;
    receipt.recruiter.reason = "missing_created_by_profile_id";
    return receipt;
  }
  const hr = await resolveRecruiterContact(params.admin, params.createdByProfileId);
  const hrEmail = hr.email ?? "";
  receipt.recruiter.recipient = hrEmail || null;
  if (!hrEmail) {
    receipt.recruiter.skipped = true;
    receipt.recruiter.reason = "missing_recruiter_email";
    return receipt;
  }
  if (!(await shouldSendEmail(hrEmail, "application_updates"))) {
    receipt.recruiter.skipped = true;
    receipt.recruiter.reason = "recruiter_email_preference_disabled";
    return receipt;
  }
  try {
    const result = await sendEmail({
      to: hrEmail,
      subject: `${params.candidateName} has accepted the offer`,
      html: offerNativeSignedHrConfirmationHtml({
        hrName: hr.fullName,
        candidateName: params.candidateName,
        jobTitle: params.roleTitle,
        companyName: params.companyName,
        companyOffersUrl: `${env.baseUrl}/company/offers`,
      }),
      attachments: [attachment],
    });
    receipt.recruiter.sent = !result.error;
    receipt.recruiter.error = result.error ? String(result.error) : null;
    receipt.recruiter.providerMessageId = (result.data as { id?: string } | null)?.id ?? null;
  } catch (e) {
    const err = String(e);
    receipt.recruiter.error = err;
    logger.warn("sendNativeSignedOfferEmailsWithPdf: HR failed", { error: err });
  }
  return receipt;
}

export async function sendNativeOfferDeclinedRecruiterEmail(
  admin: SupabaseClient,
  params: {
    createdByProfileId: string | null;
    candidateName: string;
    roleTitle: string;
    reason?: string | null;
  },
): Promise<void> {
  if (!params.createdByProfileId) return;
  const hr = await resolveRecruiterContact(admin, params.createdByProfileId);
  const hrEmail = hr.email ?? "";
  if (!hrEmail || !(await shouldSendEmail(hrEmail, "application_updates"))) return;
  try {
    await sendEmail({
      to: hrEmail,
      subject: `${params.candidateName} has declined the offer`,
      html: offerNativeDeclinedRecruiterHtml({
        recruiterName: hr.fullName,
        candidateName: params.candidateName,
        jobTitle: params.roleTitle,
        reason: params.reason ?? null,
        companyOffersUrl: `${env.baseUrl}/company/offers`,
      }),
    });
  } catch (e) {
    logger.warn("sendNativeOfferDeclinedRecruiterEmail failed", { error: String(e) });
  }
}

export async function sendNativeOfferExpiredRecruiterEmail(
  admin: SupabaseClient,
  params: {
    createdByProfileId: string | null;
    candidateName: string;
    roleTitle: string;
  },
): Promise<void> {
  if (!params.createdByProfileId) return;
  const hr = await resolveRecruiterContact(admin, params.createdByProfileId);
  const hrEmail = hr.email ?? "";
  if (!hrEmail || !(await shouldSendEmail(hrEmail, "application_updates"))) return;
  try {
    await sendEmail({
      to: hrEmail,
      subject: `Offer expired — ${params.candidateName}`,
      html: offerNativeExpiredRecruiterHtml({
        recruiterName: hr.fullName,
        candidateName: params.candidateName,
        jobTitle: params.roleTitle,
        companyOffersUrl: `${env.baseUrl}/company/offers`,
      }),
    });
  } catch (e) {
    logger.warn("sendNativeOfferExpiredRecruiterEmail failed", { error: String(e) });
  }
}

export async function sendNativeOfferWithdrawnCandidateEmail(params: {
  candidateEmail: string;
  candidateName: string;
  roleTitle: string;
  companyName: string;
}): Promise<void> {
  if (!(await shouldSendEmail(params.candidateEmail, "application_updates"))) return;
  try {
    await sendEmail({
      to: params.candidateEmail,
      subject: `Update on your offer — ${params.companyName}`,
      html: offerNativeWithdrawnCandidateHtml({
        candidateName: params.candidateName,
        jobTitle: params.roleTitle,
        companyName: params.companyName,
      }),
    });
  } catch (e) {
    logger.warn("sendNativeOfferWithdrawnCandidateEmail failed", { error: String(e) });
  }
}

export async function sendNativeOfferReminderCandidateEmail(params: {
  candidateEmail: string;
  candidateName: string;
  roleTitle: string;
  companyName: string;
  publicToken: string;
  hoursRemaining: number;
}): Promise<void> {
  const signingUrl = `${env.baseUrl}/offers/${params.publicToken}`;
  if (!(await shouldSendEmail(params.candidateEmail, "application_updates"))) return;
  try {
    await sendEmail({
      to: params.candidateEmail,
      subject: `Your offer expires in ${Math.max(1, Math.round(params.hoursRemaining))} hours`,
      html: offerNativeSigningReminderCandidateHtml({
        candidateName: params.candidateName,
        jobTitle: params.roleTitle,
        companyName: params.companyName,
        signingUrl,
        hoursRemaining: params.hoursRemaining,
      }),
    });
  } catch (e) {
    logger.warn("sendNativeOfferReminderCandidateEmail failed", { error: String(e) });
  }
}

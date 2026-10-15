import crypto from "crypto";
import { type AssessmentShareChannel } from "@/lib/assessments/constants";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";
import { sendEmail } from "@/lib/services/resend";
import { assessmentShareInviteEmailHtml } from "@/lib/services/email-templates";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export function createAssessmentShareToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function getAssessmentShareUrl(token: string): string {
  return `${env.baseUrl}/assessments/${token}`;
}

export async function sendAssessmentShareMessages(params: {
  channels: AssessmentShareChannel[];
  recipientName?: string | null;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  assessmentTitle: string;
  deadlineAt: string;
  shareToken: string;
}): Promise<{ emailSent: boolean; whatsappSent: boolean }> {
  const shareUrl = getAssessmentShareUrl(params.shareToken);
  const person = params.recipientName?.trim() || "there";
  const deadlineLabel = new Date(params.deadlineAt).toLocaleString();
  const message = `Hi ${person}, your assessment "${params.assessmentTitle}" is ready.\nSubmit here: ${shareUrl}\nDeadline: ${deadlineLabel}\n\nIf replying on WhatsApp, you can also send: SUBMIT ${params.shareToken} <your submission URL or text>`;

  let emailSent = false;
  let whatsappSent = false;

  if (params.channels.includes("email") && params.recipientEmail) {
    try {
      await sendEmail({
        to: params.recipientEmail,
        subject: `Assessment assigned: ${params.assessmentTitle}`,
        html: assessmentShareInviteEmailHtml({
          recipientName: person,
          assessmentTitle: params.assessmentTitle,
          shareUrl,
          shareToken: params.shareToken,
          deadlineLabel,
        }),
      });
      emailSent = true;
    } catch (err) {
      logger.error("Failed to send assessment email share", {
        error: String(err),
      });
    }
  }

  if (params.channels.includes("whatsapp") && params.recipientPhone) {
    const result = await sendWhatsAppMessage(params.recipientPhone, message);
    whatsappSent = result.success;
  }

  return { emailSent, whatsappSent };
}

export async function submitAssessmentByToken(params: {
  token: string;
  submissionText?: string;
  submissionUrl?: string;
  submittedVia: "web" | "whatsapp";
  requesterPhone?: string;
}): Promise<{ ok: true; assessmentId: string } | { ok: false; status: number; error: string }> {
  const submissionText = params.submissionText?.trim();
  const submissionUrl = params.submissionUrl?.trim();
  if (!submissionText && !submissionUrl) {
    return { ok: false, status: 400, error: "Either submissionText or submissionUrl is required" };
  }

  const admin = createSupabaseAdmin();
  const { data: assessment, error } = await admin
    .from("assessments")
    .select("id, application_id, status, deadline_at")
    .eq("share_token", params.token)
    .maybeSingle();
  if (error || !assessment) return { ok: false, status: 404, error: "Assessment link not found" };
  if (assessment.status !== "pending")
    return { ok: false, status: 409, error: "Assessment already submitted or scored" };
  if (new Date(assessment.deadline_at).getTime() < Date.now()) {
    return { ok: false, status: 410, error: "Assessment deadline has passed" };
  }

  if (params.requesterPhone) {
    const { data: application } = await admin
      .from("applications")
      .select("candidate_id")
      .eq("id", assessment.application_id)
      .maybeSingle();
    let expected = "";
    if (application?.candidate_id) {
      const { data: candidate } = await admin
        .from("candidates")
        .select("phone")
        .eq("id", application.candidate_id)
        .maybeSingle();
      expected = (candidate?.phone ?? "").replace(/\D/g, "");
    }
    const got = params.requesterPhone.replace(/\D/g, "");
    if (expected && expected !== got) {
      return {
        ok: false,
        status: 403,
        error: "This assessment link is not mapped to your WhatsApp number",
      };
    }
  }

  const { data: updated, error: updateError } = await admin
    .from("assessments")
    .update({
      status: "submitted",
      submission_text: submissionText ?? null,
      submission_url: submissionUrl ?? null,
      submitted_at: new Date().toISOString(),
      feedback: params.submittedVia === "whatsapp" ? "Submitted via WhatsApp" : null,
    })
    .eq("id", assessment.id)
    .eq("status", "pending")
    .select("id")
    .single();

  if (updateError || !updated) {
    return { ok: false, status: 409, error: "Assessment already submitted or scored" };
  }

  return { ok: true, assessmentId: updated.id as string };
}

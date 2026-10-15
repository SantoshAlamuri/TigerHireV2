import { env } from "@/lib/config/env";
import { sendEmail, shouldSendEmail } from "@/lib/services/resend";
import {
  pendingApprovalTaskEmailHtml,
  feedbackDueTaskEmailHtml,
  interviewConfirmedTaskEmailHtml,
} from "@/lib/services/email-templates";
import { canSendWhatsApp } from "@/lib/whatsapp/outbound-policy";
import { logger } from "@/lib/observability/logger";

function appBaseUrl(): string {
  return (env.baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://tigerhire.io").replace(
    /\/$/,
    "",
  );
}

export function tasksDeepLink(taskId: string): string {
  return `${appBaseUrl()}/tasks?task=${encodeURIComponent(taskId)}`;
}

type Recipient = {
  email: string | null | undefined;
  phone?: string | null | undefined;
  name?: string | null;
};

/**
 * Send transactional email when WhatsApp is unavailable or recipient has no phone.
 */
export async function sendInternalTaskEmailIfNeeded(params: {
  recipient: Recipient;
  kind: "pending_approval" | "feedback_due" | "interview_confirmed";
  taskId?: string;
  title: string;
  bodyLines: string[];
  /** For interview_confirmed */
  icsAttachment?: { filename: string; content: string };
  emailCategory?: "application_updates" | "interview_reminders";
}): Promise<boolean> {
  const email = params.recipient.email?.trim();
  if (!email) return false;

  const category = params.emailCategory ?? "application_updates";
  if (!(await shouldSendEmail(email, category))) return false;

  const phone = params.recipient.phone?.trim() ?? "";
  const waOk =
    phone.length > 0 &&
    (
      await canSendWhatsApp({
        phone,
        purpose: "transactional",
      })
    ).allowed;

  if (waOk) return false;

  const taskUrl = params.taskId ? tasksDeepLink(params.taskId) : `${appBaseUrl()}/tasks`;
  const name = (params.recipient.name ?? "there").trim() || "there";

  let html: string;
  let subject: string;

  switch (params.kind) {
    case "pending_approval":
      subject = params.title;
      html = pendingApprovalTaskEmailHtml({
        recipientName: name,
        title: params.title,
        bodyLines: params.bodyLines,
        tasksUrl: taskUrl,
      });
      break;
    case "feedback_due":
      subject = params.title;
      html = feedbackDueTaskEmailHtml({
        recipientName: name,
        title: params.title,
        bodyLines: params.bodyLines,
        tasksUrl: taskUrl,
      });
      break;
    case "interview_confirmed":
      subject = params.title;
      html = interviewConfirmedTaskEmailHtml({
        recipientName: name,
        title: params.title,
        bodyLines: params.bodyLines,
        tasksUrl: taskUrl,
      });
      break;
    default:
      return false;
  }

  try {
    await sendEmail({
      to: email,
      subject,
      html,
      attachments: params.icsAttachment
        ? [
            {
              filename: params.icsAttachment.filename,
              content: Buffer.from(params.icsAttachment.content, "utf8").toString("base64"),
            },
          ]
        : undefined,
    });
    return true;
  } catch (err) {
    logger.warn("sendInternalTaskEmailIfNeeded failed", {
      kind: params.kind,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

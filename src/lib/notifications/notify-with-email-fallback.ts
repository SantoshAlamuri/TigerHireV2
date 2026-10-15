import { createNotification } from "@/lib/services/notifications";
import type { NotificationType } from "@/types";
import { sendInternalTaskEmailIfNeeded } from "./internal-task-email";

type Params = {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  metadata?: Record<string, string>;
  taskId?: string;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  recipientName?: string | null;
  emailKind?: "pending_approval" | "feedback_due" | "interview_confirmed";
  emailBodyLines?: string[];
  emailCategory?: "application_updates" | "interview_reminders";
};

/**
 * In-app notification plus transactional email when WhatsApp is not available.
 */
export async function notifyWithEmailFallback(params: Params): Promise<boolean> {
  const ok = await createNotification({
    userId: params.userId,
    type: params.type,
    title: params.title,
    body: params.body,
    link: params.link,
    metadata: params.metadata,
  });

  if (params.emailKind && params.recipientEmail) {
    await sendInternalTaskEmailIfNeeded({
      recipient: {
        email: params.recipientEmail,
        phone: params.recipientPhone,
        name: params.recipientName,
      },
      kind: params.emailKind,
      taskId: params.taskId,
      title: params.title,
      bodyLines: params.emailBodyLines ?? [params.body ?? params.title],
      emailCategory: params.emailCategory,
    });
  }

  return ok;
}

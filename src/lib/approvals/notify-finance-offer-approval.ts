import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotification } from "@/lib/services/notifications";
import { sendEmail, shouldSendEmail } from "@/lib/services/resend";
import { generateApprovalTokens } from "@/lib/approvals/approval-deep-link";
import { logger } from "@/lib/observability/logger";
import { env } from "@/lib/config/env";
import { listApproverProfileIdsForRole } from "@/lib/approvals/actor-resolution";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A14: finance approvers get in-app notification + email with one-click approve/reject links.
 */
export async function notifyFinanceUsersOfferPendingApproval(
  admin: SupabaseClient,
  params: {
    organisationId: string;
    offerId: string;
    roleTitle: string;
    routeLog: string;
    notificationTitle?: string;
    notificationIntro?: string;
  },
): Promise<void> {
  const title = params.notificationTitle ?? "Offer requires finance approval";
  const intro =
    params.notificationIntro ?? `A new offer for ${params.roleTitle} is pending your review.`;

  const userIds = await listApproverProfileIdsForRole(admin, {
    organisationId: params.organisationId,
    role: "finance",
  });

  for (const userId of userIds) {
    let approveUrl = "";
    let rejectUrl = "";
    try {
      const tokens = await generateApprovalTokens(admin, {
        approverId: userId,
        offerId: params.offerId,
      });
      approveUrl = tokens.approveUrl;
      rejectUrl = tokens.rejectUrl;
    } catch (e) {
      logger.warn("notifyFinanceUsersOfferPendingApproval: token mint failed", {
        error: String(e),
        offerId: params.offerId,
        userId,
        route: params.routeLog,
      });
    }

    const bodyWithLinks =
      approveUrl && rejectUrl
        ? `${intro}\n\nApprove (one click): ${approveUrl}\nReject (one click): ${rejectUrl}`
        : `${intro}\n\nOpen Finance inbox in TigerHire to review.`;

    const ok = await createNotification({
      userId,
      type: "approval_needed",
      title,
      body: bodyWithLinks,
      link: "/company/finance",
      metadata: {
        offerId: params.offerId,
        ...(approveUrl ? { approveUrl } : {}),
        ...(rejectUrl ? { rejectUrl } : {}),
      },
    });
    if (!ok) {
      logger.warn("createNotification failed", { route: params.routeLog, userId });
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .maybeSingle();
    const email = (profile?.email as string | undefined)?.trim();
    if (!email || !approveUrl || !rejectUrl) continue;

    const allow = await shouldSendEmail(email, "application_updates");
    if (!allow) continue;

    try {
      await sendEmail({
        to: email,
        subject: `${title} — ${params.roleTitle}`,
        html: `<p>${escapeHtml(intro)}</p>
<p><a href="${approveUrl}">Approve</a> · <a href="${rejectUrl}">Reject</a></p>
<p style="color:#666;font-size:13px">Each link works once and expires in 48 hours. <a href="${env.baseUrl}/company/finance">Finance inbox</a></p>`,
      });
    } catch (err) {
      logger.warn("notifyFinanceUsersOfferPendingApproval: email failed", {
        error: String(err),
        userId,
        route: params.routeLog,
      });
    }
  }
}

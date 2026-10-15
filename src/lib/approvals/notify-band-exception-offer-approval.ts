import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotification } from "@/lib/services/notifications";
import { sendEmail, shouldSendEmail } from "@/lib/services/resend";
import { generateApprovalTokens } from "@/lib/approvals/approval-deep-link";
import { logger } from "@/lib/observability/logger";
import { env } from "@/lib/config/env";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * B7: notify comp / finance approvers to approve or reject an out-of-band offer before send.
 */
export async function notifyBandExceptionApprovers(
  admin: SupabaseClient,
  params: {
    organisationId: string;
    offerId: string;
    roleTitle: string;
    approverIds: string[];
    routeLog: string;
  },
): Promise<void> {
  const title = "Compensation band exception needs approval";
  const intro = `An offer for ${params.roleTitle} is outside the selected compensation band and needs your approval before it can be sent to the candidate.`;

  for (const userId of params.approverIds) {
    let approveUrl = "";
    let rejectUrl = "";
    try {
      const tokens = await generateApprovalTokens(admin, {
        approverId: userId,
        offerId: params.offerId,
        approvalType: "band_exception",
      });
      approveUrl = tokens.approveUrl;
      rejectUrl = tokens.rejectUrl;
    } catch (e) {
      logger.warn("notifyBandExceptionApprovers: token mint failed", {
        error: String(e),
        offerId: params.offerId,
        userId,
        route: params.routeLog,
      });
    }

    const bodyWithLinks =
      approveUrl && rejectUrl
        ? `${intro}\n\nApprove (one click): ${approveUrl}\nReject (one click): ${rejectUrl}`
        : `${intro}\n\nOpen TigerHire to review.`;

    const ok = await createNotification({
      userId,
      type: "approval_needed",
      title,
      body: bodyWithLinks,
      link: "/company/offers",
      metadata: {
        offerId: params.offerId,
        approvalType: "band_exception",
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
<p><a href="${approveUrl}">Approve exception</a> · <a href="${rejectUrl}">Reject</a></p>
<p style="color:#666;font-size:13px">Each link works once and expires in 48 hours. <a href="${env.baseUrl}/company/offers">Offers</a></p>`,
      });
    } catch (err) {
      logger.warn("notifyBandExceptionApprovers: email failed", {
        error: String(err),
        userId,
        route: params.routeLog,
      });
    }
  }
}

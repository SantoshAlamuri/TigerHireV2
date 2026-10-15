import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/api-helpers";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";
import { validateOrigin } from "@/lib/security/csrf";
import {
  approvalDeepLinkEscapeHtml,
  approvalDeepLinkHtmlShell,
  runApprovalDeepLinkDecision,
  type ConsumedApprovalTokenRow,
} from "@/lib/approvals/run-approval-deep-link-decision";

/**
 * GET /api/approvals/action/[token] — show confirm screen only (A14). Does not consume the token
 * so link scanners cannot burn approvals.
 *
 * POST /api/approvals/action/[token] — consumes token and records the decision.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const dashboardUrl = `${env.baseUrl}/company/offers`;

  if (!token || token.length < 16) {
    return new NextResponse(
      approvalDeepLinkHtmlShell(
        "Link invalid",
        `<p>This approval link is invalid.</p><p><a href="${dashboardUrl}">Open dashboard</a></p>`,
      ),
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const admin = createSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data: tokenRow, error: readErr } = await admin
    .from("approval_tokens")
    .select("id, action, offer_id, hiring_request_id, approver_profile_id, approval_type")
    .eq("token", token)
    .is("used_at", null)
    .gt("expires_at", nowIso)
    .maybeSingle();

  if (readErr) {
    logger.error("approval deep link: read token failed", { error: readErr.message });
    return new NextResponse(
      approvalDeepLinkHtmlShell(
        "Something went wrong",
        `<p>We could not load this link. Try again from your dashboard.</p><p><a href="${dashboardUrl}">Open dashboard</a></p>`,
      ),
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  if (!tokenRow) {
    return new NextResponse(
      approvalDeepLinkHtmlShell(
        "Link expired or used",
        `<p>This approval link has expired or has already been used.</p><p><a href="${dashboardUrl}">Open dashboard</a></p>`,
      ),
      { status: 410, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const hiringRequestId = tokenRow.hiring_request_id as string | null;
  const offerId = tokenRow.offer_id as string | null;
  const action = tokenRow.action as string;
  const isApprove = action === "approve";

  let summary = "this approval";
  let dashboardHint = dashboardUrl;
  if (hiringRequestId && !offerId) {
    const { data: hr } = await admin
      .from("hiring_requests")
      .select("title")
      .eq("id", hiringRequestId)
      .maybeSingle();
    summary = `requisition <strong>${approvalDeepLinkEscapeHtml(String(hr?.title ?? "Request"))}</strong>`;
    dashboardHint = `${env.baseUrl}/company/hiring-requests`;
  } else if (offerId) {
    const { data: off } = await admin
      .from("offers")
      .select("role_title")
      .eq("id", offerId)
      .maybeSingle();
    summary = `offer <strong>${approvalDeepLinkEscapeHtml(String(off?.role_title ?? "Offer"))}</strong>`;
  }

  const verb = isApprove ? "approve" : "reject";
  const verbTitle = isApprove ? "Approve" : "Reject";
  const postUrl = `${env.baseUrl}/api/approvals/action/${token}`;

  const body = `
<p>You opened an email approval link for ${summary}.</p>
<p><strong>This action is not recorded yet.</strong> Email scanners may open links automatically — confirm only if you intend to <strong>${approvalDeepLinkEscapeHtml(verb)}</strong>.</p>
<form method="post" action="${postUrl}">
  <button type="submit">${approvalDeepLinkEscapeHtml(`${verbTitle} now`)}</button>
</form>
<p style="margin-top:1.5rem"><a href="${dashboardHint}">Open dashboard instead</a></p>
`;

  return new NextResponse(approvalDeepLinkHtmlShell(`${verbTitle} request`, body), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const dashboardUrl = `${env.baseUrl}/company/offers`;
  const csrf = validateOrigin(request);
  if (csrf) {
    return new NextResponse(
      approvalDeepLinkHtmlShell(
        "Could not confirm",
        `<p>This confirmation must be submitted from the same site. Open the link in your browser and try again.</p><p><a href="${dashboardUrl}">Open dashboard</a></p>`,
      ),
      { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const { token } = await params;

  if (!token || token.length < 16) {
    return new NextResponse(
      approvalDeepLinkHtmlShell(
        "Link invalid",
        `<p>This approval link is invalid.</p><p><a href="${dashboardUrl}">Open dashboard</a></p>`,
      ),
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const admin = createSupabaseAdmin();
  const nowIso = new Date().toISOString();

  // Identity binding: the email deep-link is an intentionally unauthenticated flow (the
  // approver may click from a mail client with no session) protected by single-use + expiry.
  // BUT if the request *is* authenticated, the session user must be the token's approver — or
  // an admin (super_admin, or org admin of the resource's org). This prevents an authenticated
  // user from approving on behalf of someone else simply by holding the link. We check this
  // BEFORE consuming the token so an unauthorized click does not burn a legitimate approver's
  // token. Unauthenticated requests fall through to the single-use+expiry guard below.
  const authCtx = await getAuthContext();
  if (authCtx) {
    const { data: pending } = await admin
      .from("approval_tokens")
      .select("approver_profile_id, offer_id, hiring_request_id")
      .eq("token", token)
      .is("used_at", null)
      .gt("expires_at", nowIso)
      .maybeSingle();

    if (pending) {
      const approverId = pending.approver_profile_id as string;
      let allowed = authCtx.userId === approverId || authCtx.role === "super_admin";

      if (!allowed && authCtx.isOrgAdmin && authCtx.organisationId) {
        // Org admins may decide for tokens scoped to a resource in their own org.
        let resourceOrgId: string | null = null;
        const offerId = pending.offer_id as string | null;
        const hiringRequestId = pending.hiring_request_id as string | null;
        if (offerId) {
          const { data: offer } = await admin
            .from("offers")
            .select("organisation_id")
            .eq("id", offerId)
            .maybeSingle();
          resourceOrgId = (offer?.organisation_id as string | null) ?? null;
        } else if (hiringRequestId) {
          const { data: hr } = await admin
            .from("hiring_requests")
            .select("organisation_id")
            .eq("id", hiringRequestId)
            .maybeSingle();
          resourceOrgId = (hr?.organisation_id as string | null) ?? null;
        }
        allowed = Boolean(resourceOrgId && resourceOrgId === authCtx.organisationId);
      }

      if (!allowed) {
        logger.warn("approval deep link: authenticated user is not the approver", {
          userId: authCtx.userId,
          approverProfileId: approverId,
        });
        return new NextResponse(
          approvalDeepLinkHtmlShell(
            "Not authorized",
            `<p>You are signed in as a different user than the assigned approver for this request. Ask the assigned approver to action it, or open it from your dashboard.</p><p><a href="${dashboardUrl}">Open dashboard</a></p>`,
          ),
          { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      }
    }
  }

  const { data: consumed, error: consumeErr } = await admin
    .from("approval_tokens")
    .update({ used_at: nowIso })
    .eq("token", token)
    .is("used_at", null)
    .gt("expires_at", nowIso)
    .select("id, action, offer_id, hiring_request_id, approver_profile_id, approval_type")
    .maybeSingle();

  if (consumeErr) {
    logger.error("approval deep link: consume failed", { error: consumeErr.message });
    return new NextResponse(
      approvalDeepLinkHtmlShell(
        "Something went wrong",
        `<p>We could not process this link. Try again from your dashboard.</p><p><a href="${dashboardUrl}">Open dashboard</a></p>`,
      ),
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  if (!consumed) {
    return new NextResponse(
      approvalDeepLinkHtmlShell(
        "Link expired or used",
        `<p>This approval link has expired or has already been used.</p><p><a href="${dashboardUrl}">Open dashboard</a></p>`,
      ),
      { status: 410, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  return runApprovalDeepLinkDecision(admin, request, consumed as ConsumedApprovalTokenRow, {
    logRoute: "POST /api/approvals/action/[token]",
  });
}

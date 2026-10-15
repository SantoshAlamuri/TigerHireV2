import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/config/env";
import { recordHiringOfferAuditEvent } from "@/lib/audit/hiring-offer-audit";
import { executeOfferFinanceDecision } from "@/lib/offers/offer-finance-decision";
import { getRequestClientIp } from "@/lib/audit/client-ip";
import { createNotification } from "@/lib/services/notifications";
import { getOrgSettingsPermissions } from "@/lib/settings/permissions";
import { canActorApproveBandException } from "@/lib/offers/band-exception-approvers";
import type { ApprovalTokenType } from "@/lib/approvals/approval-deep-link";
import { decideRequisitionApprovalStage } from "@/lib/workflows/requisition-approval-workflow";
import { validateRequisitionTransition } from "@/lib/workflows/requisition-state-machine";
import { logger } from "@/lib/observability/logger";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlShell(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 36rem; margin: 2rem auto; padding: 0 1rem; color: #111; }
    a { color: #ea580c; }
    p { line-height: 1.5; }
    button { font: inherit; padding: 0.5rem 1rem; margin-right: 0.5rem; cursor: pointer; }
  </style>
</head>
<body>
  <h1 style="font-size:1.25rem">${escapeHtml(title)}</h1>
  ${bodyHtml}
</body>
</html>`;
}

export type ConsumedApprovalTokenRow = {
  id: string;
  action: string;
  offer_id: string | null;
  hiring_request_id: string | null;
  approver_profile_id: string;
  approval_type: string | null;
};

/**
 * Runs approve/reject side effects after a token row has been consumed (used_at set).
 * Used by POST /api/approvals/action/[token] (A14).
 */
export async function runApprovalDeepLinkDecision(
  admin: SupabaseClient,
  request: NextRequest,
  consumed: ConsumedApprovalTokenRow,
  params: { logRoute: string },
): Promise<NextResponse> {
  const dashboardUrl = `${env.baseUrl}/company/offers`;
  const offerId = consumed.offer_id as string | null;
  const hiringRequestId = consumed.hiring_request_id as string | null;
  const approverId = consumed.approver_profile_id as string;
  const action = consumed.action as string;
  const approvalType = (consumed.approval_type as ApprovalTokenType | null) ?? "finance";

  if (hiringRequestId && !offerId) {
    const requestDashboardUrl = `${env.baseUrl}/company/hiring-requests`;
    const { data: requestRow } = await admin
      .from("hiring_requests")
      .select("organisation_id, title, status, created_by")
      .eq("id", hiringRequestId)
      .maybeSingle();
    if (!requestRow) {
      return new NextResponse(
        htmlShell(
          "Requisition not found",
          `<p><a href="${requestDashboardUrl}">Open dashboard</a></p>`,
        ),
        { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    const { data: actorProfile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", approverId)
      .maybeSingle();
    const actorRole = (actorProfile?.role as string | null) ?? null;
    const decision = action === "approve" ? "approved" : "rejected";
    const decisionResult = await decideRequisitionApprovalStage(admin, {
      hiringRequestId,
      actorProfileId: approverId,
      decision,
      comment: "Decision via one-click approval email link.",
    });
    if (!decisionResult.ok) {
      return new NextResponse(
        htmlShell(
          "Could not record decision",
          `<p>${escapeHtml(decisionResult.error)}</p><p><a href="${requestDashboardUrl}">Open dashboard</a></p>`,
        ),
        {
          status: decisionResult.status >= 400 ? decisionResult.status : 400,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        },
      );
    }

    const nextStatus =
      decisionResult.workflowStatus === "completed"
        ? "approved"
        : decisionResult.workflowStatus === "rejected"
          ? "rejected"
          : "under_review";
    const transitionCheck = validateRequisitionTransition({
      from: String(requestRow.status ?? ""),
      to: nextStatus,
      actorRole: String(actorRole ?? ""),
      reason: "Decision via one-click approval email link.",
    });
    if (!transitionCheck.ok) {
      return new NextResponse(
        htmlShell(
          "Could not record decision",
          `<p>${escapeHtml(transitionCheck.error)}</p><p><a href="${requestDashboardUrl}">Open dashboard</a></p>`,
        ),
        {
          status: transitionCheck.status,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        },
      );
    }
    await admin
      .from("hiring_requests")
      .update({
        status: nextStatus,
        reviewed_by: approverId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", hiringRequestId);

    await recordHiringOfferAuditEvent({
      organisationId: requestRow.organisation_id as string,
      entityType: "hiring_request",
      entityId: hiringRequestId,
      eventType: "HIRING_REQUEST_APPROVAL_DEEP_LINK_DECISION",
      actorProfileId: approverId,
      actorRole,
      prevStatus: (requestRow.status as string) ?? null,
      newStatus: nextStatus,
      decision,
      comments: "Decision via one-click approval email link.",
      channel: "email_link",
      metadata: {
        token_id: consumed.id as string,
        workflow_status: decisionResult.workflowStatus,
      },
      ipAddress: getRequestClientIp(request),
    });

    const creatorId = requestRow.created_by as string | null;
    if (creatorId) {
      await createNotification({
        userId: creatorId,
        type: "hiring_request_new",
        title:
          decision === "approved"
            ? `Requisition "${String(requestRow.title ?? "Request")}" approval recorded`
            : `Requisition "${String(requestRow.title ?? "Request")}" was rejected`,
        body:
          nextStatus === "under_review"
            ? "One approval stage is complete. Additional approvers are still pending."
            : decision === "approved"
              ? "All required approval stages are complete."
              : "The approval flow has been rejected.",
        link: "/company/hiring-requests",
      });
    }

    const verb = action === "approve" ? "approval" : "rejection";
    return new NextResponse(
      htmlShell(
        "Recorded",
        `<p>Your <strong>${escapeHtml(verb)}</strong> has been recorded for requisition <strong>${escapeHtml(String(requestRow.title ?? "Request"))}</strong>.</p><p><a href="${requestDashboardUrl}">Open requisitions</a></p>`,
      ),
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  if (!offerId) {
    return new NextResponse(
      htmlShell("Link invalid", `<p><a href="${dashboardUrl}">Open dashboard</a></p>`),
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const { data: offerRow } = await admin
    .from("offers")
    .select("organisation_id, role_title, status, band_status, created_by")
    .eq("id", offerId)
    .maybeSingle();

  if (!offerRow) {
    return new NextResponse(
      htmlShell("Offer not found", `<p><a href="${dashboardUrl}">Open dashboard</a></p>`),
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const orgId = offerRow.organisation_id as string;
  const roleTitle = (offerRow.role_title as string) ?? "Offer";

  const { data: actorProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", approverId)
    .maybeSingle();
  const actorRole = (actorProfile?.role as string | null) ?? null;

  await recordHiringOfferAuditEvent({
    organisationId: orgId,
    entityType: "offer",
    entityId: offerId,
    eventType: "APPROVAL_DEEP_LINK_USED",
    actorProfileId: approverId,
    actorRole,
    prevStatus: (offerRow.status as string) ?? null,
    newStatus: null,
    channel: "email_link",
    metadata: {
      token_id: consumed.id as string,
      action,
      offer_id: offerId,
      approver_profile_id: approverId,
      source: "approval_deep_link",
      approval_type: approvalType,
    },
    ipAddress: getRequestClientIp(request),
  });

  if (approvalType === "band_exception") {
    const permissions = await getOrgSettingsPermissions(admin, orgId);
    const allowedActor = await canActorApproveBandException(admin, orgId, approverId, permissions);
    if (!allowedActor) {
      return new NextResponse(
        htmlShell(
          "Not authorized",
          `<p>You are not authorized to decide this band exception.</p><p><a href="${dashboardUrl}">Open dashboard</a></p>`,
        ),
        { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    if ((offerRow.band_status as string | null) !== "exception_pending") {
      return new NextResponse(
        htmlShell(
          "Offer not pending exception review",
          `<p>This offer is no longer awaiting a band exception decision.</p><p><a href="${dashboardUrl}">Open dashboard</a></p>`,
        ),
        { status: 409, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    const nextBand = action === "approve" ? "exception_approved" : ("exception_rejected" as const);
    const eventType =
      action === "approve" ? "BAND_EXCEPTION_APPROVED" : ("BAND_EXCEPTION_REJECTED" as const);

    const { data: updatedBand, error: bandUpdErr } = await admin
      .from("offers")
      .update({
        band_status: nextBand,
        band_checked_at: new Date().toISOString(),
      })
      .eq("id", offerId)
      .eq("band_status", "exception_pending")
      .select("id")
      .maybeSingle();

    if (bandUpdErr || !updatedBand) {
      return new NextResponse(
        htmlShell(
          "Could not update offer",
          `<p>This decision could not be applied (the offer may have changed). <a href="${dashboardUrl}">Open dashboard</a></p>`,
        ),
        { status: 409, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    await recordHiringOfferAuditEvent({
      organisationId: orgId,
      entityType: "offer",
      entityId: offerId,
      eventType,
      actorProfileId: approverId,
      actorRole,
      prevStatus: "exception_pending",
      newStatus: nextBand,
      decision: action === "approve" ? "approved" : "rejected",
      channel: "email_link",
      ipAddress: getRequestClientIp(request),
    });

    const creatorId = offerRow.created_by as string | null;
    if (creatorId) {
      const ok = await createNotification({
        userId: creatorId,
        type: "application_update",
        title:
          action === "approve"
            ? "Band exception approved — you can now send this offer"
            : "Band exception rejected",
        body:
          action === "approve"
            ? `The compensation band exception for "${roleTitle}" was approved. Send the offer when ready.`
            : `The compensation band exception for "${roleTitle}" was rejected via approval link.`,
        link: "/company/offers",
        metadata: {
          offerId,
          bandExceptionDecision: action === "approve" ? "approved" : "rejected",
        },
      });
      if (!ok) {
        logger.warn("band exception decision: createNotification failed", { offerId, creatorId });
      }
    }

    const verb = action === "approve" ? "approval" : "rejection";
    return new NextResponse(
      htmlShell(
        "Recorded",
        `<p>Your <strong>${escapeHtml(verb)}</strong> for the band exception on <strong>${escapeHtml(roleTitle)}</strong> has been recorded.</p><p><a href="${dashboardUrl}">Open Offers</a></p>`,
      ),
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const financeDashboardUrl = `${env.baseUrl}/company/finance`;
  const decision = action === "approve" ? "approved" : "rejected";
  const result = await executeOfferFinanceDecision(admin, {
    offerId,
    decision,
    comment: null,
    actorProfileId: approverId,
    actorRole,
    requestIp: getRequestClientIp(request),
    auditChannel: "email_link",
    logRoute: params.logRoute,
  });

  if (!result.ok) {
    const msg =
      result.status === 403
        ? "You are no longer authorized to complete this action, or this offer is not pending finance review."
        : result.status === 409
          ? "This offer is no longer awaiting a finance decision (it may have been decided already)."
          : escapeHtml(result.error);
    return new NextResponse(
      htmlShell(
        "Could not record decision",
        `<p>${msg}</p><p><a href="${financeDashboardUrl}">Open dashboard</a></p>`,
      ),
      {
        status: result.status >= 400 ? result.status : 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      },
    );
  }

  const verb = action === "approve" ? "approval" : "rejection";
  return new NextResponse(
    htmlShell(
      "Recorded",
      `<p>Your <strong>${escapeHtml(verb)}</strong> has been recorded for the offer <strong>${escapeHtml(roleTitle)}</strong>.</p><p><a href="${financeDashboardUrl}">Open Finance inbox</a> for more detail.</p>`,
    ),
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export function approvalDeepLinkHtmlShell(title: string, bodyHtml: string): string {
  return htmlShell(title, bodyHtml);
}

export function approvalDeepLinkEscapeHtml(s: string): string {
  return escapeHtml(s);
}

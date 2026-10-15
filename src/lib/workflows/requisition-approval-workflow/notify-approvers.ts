import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import { createNotification } from "@/lib/services/notifications";
import { notifyWithEmailFallback } from "@/lib/notifications/notify-with-email-fallback";
import { generateApprovalTokens } from "@/lib/approvals/approval-deep-link";
import { listApproverProfileIdsForRole } from "@/lib/approvals/actor-resolution";

/**
 * Tell the person who raised a requisition how it was decided — approvals used to
 * end in silence, so a requester had to keep logging in to learn the outcome. (#353)
 */
export async function notifyRequisitionRequester(
  admin: SupabaseClient,
  params: { hiringRequestId: string; outcome: "approved" | "rejected" },
): Promise<void> {
  try {
    const { data: req } = await admin
      .from("hiring_requests")
      .select("title, created_by")
      .eq("id", params.hiringRequestId)
      .maybeSingle();
    const requesterId = req?.created_by as string | undefined;
    if (!requesterId) return;
    const title =
      ((req?.title as string | null) ?? "your requisition").trim() || "your requisition";
    const approved = params.outcome === "approved";
    await createNotification({
      userId: requesterId,
      type: "application_update",
      title: approved ? `Requisition approved: ${title}` : `Requisition rejected: ${title}`,
      body: approved
        ? `Your requisition "${title}" has been fully approved.`
        : `Your requisition "${title}" was not approved.`,
      link: "/company/hiring-requests",
      metadata: { hiringRequestId: params.hiringRequestId, outcome: params.outcome },
    });
  } catch (err) {
    logger.warn("notifyRequisitionRequester failed", {
      hiringRequestId: params.hiringRequestId,
      error: String(err),
    });
  }
}

export async function notifyActiveRequisitionApprovers(
  admin: SupabaseClient,
  params: {
    organisationId: string;
    hiringRequestId: string;
    requestTitle: string;
    stageRoles: string[];
  },
): Promise<void> {
  // Resolve approvers for every stage role concurrently, then notify each
  // approver concurrently. Each approver needs a personalised approve/reject
  // token pair, so the work can't be collapsed into one insert — but running it
  // in parallel turns N sequential round-trips into a single wave of latency,
  // which is what kept the approval decision from confirming quickly.
  const roleApprovers = await Promise.all(
    params.stageRoles.map(async (role) => ({
      role,
      approverIds: await listApproverProfileIdsForRole(admin, {
        organisationId: params.organisationId,
        role,
      }),
    })),
  );

  // Resolve approver contact details once so the notification can fall back to
  // email — approvals previously only ever created an in-app notification, so an
  // approver who never opens the app never learned a requisition was waiting.
  const allApproverIds = [...new Set(roleApprovers.flatMap((r) => r.approverIds))];
  const contactById = new Map<
    string,
    { email: string | null; name: string | null; phone: string | null }
  >();
  if (allApproverIds.length > 0) {
    const { data: profileRows } = await admin
      .from("profiles")
      .select("id, full_name, email, phone")
      .in("id", allApproverIds);
    for (const p of profileRows ?? []) {
      contactById.set(p.id as string, {
        email: (p.email as string | null) ?? null,
        name: (p.full_name as string | null) ?? null,
        phone: (p.phone as string | null) ?? null,
      });
    }
  }

  await Promise.all(
    roleApprovers.flatMap(({ role, approverIds }) =>
      approverIds.map(async (approverId) => {
        try {
          const tokens = await generateApprovalTokens(admin, {
            approverId,
            hiringRequestId: params.hiringRequestId,
          });
          const contact = contactById.get(approverId);
          await notifyWithEmailFallback({
            userId: approverId,
            type: "approval_needed",
            title: `Approval needed: ${params.requestTitle}`,
            body: `Approve: ${tokens.approveUrl}\nReject: ${tokens.rejectUrl}`,
            link: "/tasks?shape=decide&category=approvals",
            metadata: {
              hiringRequestId: params.hiringRequestId,
              approvalRole: role,
              approvalLinkApprove: tokens.approveUrl,
              approvalLinkReject: tokens.rejectUrl,
            },
            recipientEmail: contact?.email ?? null,
            recipientName: contact?.name ?? null,
            recipientPhone: contact?.phone ?? null,
            emailKind: "pending_approval",
            emailBodyLines: [
              `A requisition is awaiting your approval: ${params.requestTitle}.`,
              `Approve: ${tokens.approveUrl}`,
              `Reject: ${tokens.rejectUrl}`,
            ],
          });
        } catch (err) {
          logger.warn("notifyActiveRequisitionApprovers failed", {
            hiringRequestId: params.hiringRequestId,
            role,
            error: String(err),
          });
        }
      }),
    ),
  );
}

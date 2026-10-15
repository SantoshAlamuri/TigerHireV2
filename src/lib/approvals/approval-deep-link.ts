import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/config/env";

/**
 * A14: shared secret bucket with A15 when `APPROVAL_DEEP_LINK_SECRET` unset (`env.approvalDeepLinkSecret`).
 * Tokens are stored server-side; randomBytes(32) hex is the credential (same pattern as offer `public_token`).
 */
export function getApprovalDeepLinkSecret(): string {
  return env.approvalDeepLinkSecret;
}

export type ApprovalTokenType = "finance" | "band_exception";

export async function invalidateUnusedApprovalTokensForApproverEntity(
  admin: SupabaseClient,
  params: {
    approverProfileId: string;
    offerId?: string;
    hiringRequestId?: string;
    approvalType?: ApprovalTokenType;
  },
): Promise<void> {
  const nowIso = new Date().toISOString();
  const approvalType = params.approvalType ?? "finance";
  if (params.offerId) {
    await admin
      .from("approval_tokens")
      .update({ used_at: nowIso })
      .eq("offer_id", params.offerId)
      .eq("approver_profile_id", params.approverProfileId)
      .eq("approval_type", approvalType)
      .is("used_at", null);
    return;
  }
  if (params.hiringRequestId) {
    await admin
      .from("approval_tokens")
      .update({ used_at: nowIso })
      .eq("hiring_request_id", params.hiringRequestId)
      .eq("approver_profile_id", params.approverProfileId)
      .eq("approval_type", approvalType)
      .is("used_at", null);
  }
}

/**
 * Inserts two single-use rows (approve + reject). Invalidates prior unused tokens for the same approver + entity.
 */
export async function generateApprovalTokens(
  admin: SupabaseClient,
  params: {
    approverId: string;
    offerId?: string;
    hiringRequestId?: string;
    expiresInHours?: number;
    /** Default finance (A14). B7 band exceptions use band_exception. */
    approvalType?: ApprovalTokenType;
  },
): Promise<{ approveToken: string; rejectToken: string; approveUrl: string; rejectUrl: string }> {
  const {
    approverId,
    offerId,
    hiringRequestId,
    expiresInHours = 48,
    approvalType = "finance",
  } = params;
  if (!offerId && !hiringRequestId) {
    throw new Error("generateApprovalTokens: offerId or hiringRequestId required");
  }
  if (offerId && hiringRequestId) {
    throw new Error("generateApprovalTokens: pass only one of offerId or hiringRequestId");
  }

  await invalidateUnusedApprovalTokensForApproverEntity(admin, {
    approverProfileId: approverId,
    offerId,
    hiringRequestId,
    approvalType,
  });

  const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000).toISOString();
  const approveToken = crypto.randomBytes(32).toString("hex");
  const rejectToken = crypto.randomBytes(32).toString("hex");

  const baseRow = {
    approver_profile_id: approverId,
    expires_at: expiresAt,
    approval_type: approvalType,
  };

  const { error } = offerId
    ? await admin.from("approval_tokens").insert([
        { ...baseRow, token: approveToken, offer_id: offerId, action: "approve" as const },
        { ...baseRow, token: rejectToken, offer_id: offerId, action: "reject" as const },
      ])
    : await admin.from("approval_tokens").insert([
        {
          ...baseRow,
          token: approveToken,
          hiring_request_id: hiringRequestId!,
          action: "approve" as const,
        },
        {
          ...baseRow,
          token: rejectToken,
          hiring_request_id: hiringRequestId!,
          action: "reject" as const,
        },
      ]);
  if (error) {
    throw new Error(error.message);
  }

  const baseUrl = env.baseUrl;
  return {
    approveToken,
    rejectToken,
    approveUrl: `${baseUrl}/api/approvals/action/${approveToken}`,
    rejectUrl: `${baseUrl}/api/approvals/action/${rejectToken}`,
  };
}

import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleZodError,
  handleApiError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { confirmPayoutsBodySchema } from "@/lib/validations/referral-payouts";
import { confirmPayouts } from "@/lib/services/ReferralPayoutService";

/**
 * POST /api/referrals/payouts/confirm — the company's one step in the payout flow.
 *
 * Confirming asserts the milestone was real (the hire happened). It is the gate
 * that lets a row enter a TigerHire payout run; nothing is disbursed on an
 * unconfirmed row, so an incorrect trigger costs a correction rather than money.
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin", "leadership", "recruiter")) {
      return jsonError("Forbidden", 403);
    }

    const parsedBody = await parseJsonBody(request, "POST /api/referrals/payouts/confirm");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = confirmPayoutsBodySchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const admin = createSupabaseAdmin();
    const result = await confirmPayouts(admin, {
      ledgerIds: parsed.data.ledger_ids,
      userId: ctx.userId,
      organisationId: ctx.organisationId ?? null,
      isSuperAdmin: hasRole(ctx, "super_admin"),
    });

    await admin.from("audit_log").insert({
      organisation_id: ctx.organisationId ?? null,
      actor_user_id: ctx.userId,
      event_type: "referral.payout.confirmed",
      resource_type: "payout_ledger",
      resource_id: null,
      metadata: {
        requested: parsed.data.ledger_ids.length,
        confirmed: result.confirmed,
        skipped: result.skipped,
      },
    });

    return jsonSuccess(result);
  } catch (err) {
    return handleApiError(err, "Failed to confirm referral payouts", {
      route: "POST /api/referrals/payouts/confirm",
    });
  }
}

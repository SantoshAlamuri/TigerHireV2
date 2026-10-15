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
import { markPayoutRunPaidBodySchema } from "@/lib/validations/referral-payouts";
import { markBatchPaid } from "@/lib/services/ReferralPayoutService";

/**
 * POST /api/admin/payout-runs/[id]/paid — record that the run was disbursed.
 *
 * This is the write that finally moves `payout_ledger.status` to 'paid', which
 * every "paid earnings" figure in the product has been reading and none has ever
 * seen set. Money itself moves outside the app; the operator supplies the
 * transaction reference as proof.
 *
 * 409 when the run is not open — a second submit must not re-stamp paid_at.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const { id: batchId } = await params;
    const parsedBody = await parseJsonBody(request, "POST /api/admin/payout-runs/[id]/paid");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = markPayoutRunPaidBodySchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const admin = createSupabaseAdmin();
    const batch = await markBatchPaid(admin, {
      batchId,
      userId: ctx.userId,
      paymentReference: parsed.data.payment_reference,
    });

    if (!batch) {
      return jsonError("This payout run is not open — it may already be marked paid.", 409);
    }

    await admin.from("audit_log").insert({
      organisation_id: null,
      actor_user_id: ctx.userId,
      event_type: "referral.payout_run.paid",
      resource_type: "payout_batches",
      resource_id: batch.id,
      metadata: {
        reference: batch.reference,
        rows: batch.row_count,
        total: batch.total_amount,
        payment_reference: batch.payment_reference,
      },
    });

    return jsonSuccess({ batch });
  } catch (err) {
    return handleApiError(err, "Failed to mark payout run paid", {
      route: "POST /api/admin/payout-runs/[id]/paid",
    });
  }
}

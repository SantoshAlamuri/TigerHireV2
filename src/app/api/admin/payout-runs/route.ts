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
import { generatePayoutRunBodySchema } from "@/lib/validations/referral-payouts";
import { generateBatch, listBatches } from "@/lib/services/ReferralPayoutService";

/** GET /api/admin/payout-runs — every run, newest first (TigerHire operators). */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const batches = await listBatches(createSupabaseAdmin());
    return jsonSuccess({ batches });
  } catch (err) {
    return handleApiError(err, "Failed to load payout runs", {
      route: "GET /api/admin/payout-runs",
    });
  }
}

/**
 * POST /api/admin/payout-runs — sweep every confirmed, unbatched row into a run.
 *
 * Returns 200 with `batch: null` when there was nothing to pay. That is a normal
 * outcome, not an error: the operator pressed Generate on an empty queue.
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const parsedBody = await parseJsonBody(request, "POST /api/admin/payout-runs");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = generatePayoutRunBodySchema.safeParse(parsedBody.body ?? {});
    if (!parsed.success) return handleZodError(parsed.error);

    const admin = createSupabaseAdmin();
    const batch = await generateBatch(admin, {
      userId: ctx.userId,
      note: parsed.data.note ?? null,
    });

    if (batch) {
      await admin.from("audit_log").insert({
        organisation_id: null,
        actor_user_id: ctx.userId,
        event_type: "referral.payout_run.generated",
        resource_type: "payout_batches",
        resource_id: batch.id,
        metadata: { reference: batch.reference, rows: batch.row_count, total: batch.total_amount },
      });
    }

    return jsonSuccess({ batch });
  } catch (err) {
    return handleApiError(err, "Failed to generate payout run", {
      route: "POST /api/admin/payout-runs",
    });
  }
}

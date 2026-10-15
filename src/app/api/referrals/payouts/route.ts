import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";

const STATUSES = new Set(["pending", "confirmed", "paid"]);

/**
 * GET /api/referrals/payouts?status=pending — referral payouts on this org's jobs.
 *
 * Backs the company's confirm queue. Payee bank details are deliberately absent:
 * TigerHire disburses, so `referrer_upi_id` is operator data and the company has
 * no reason to hold it.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin", "leadership", "recruiter", "finance")) {
      return jsonError("Forbidden", 403);
    }

    const statusParam = request.nextUrl.searchParams.get("status")?.trim().toLowerCase();
    if (statusParam && !STATUSES.has(statusParam)) {
      return jsonError("Invalid status filter.", 400);
    }

    const isSuperAdmin = hasRole(ctx, "super_admin");
    if (!isSuperAdmin && !ctx.organisationId) return jsonSuccess({ payouts: [] });

    const admin = createSupabaseAdmin();
    let query = admin
      .from("payout_export")
      .select(
        "ledger_id, candidate_name, referrer_name, referrer_level, trigger_event, amount, currency, status, job_id, job_title, created_at, confirmed_at, paid_at, batch_reference",
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (!isSuperAdmin) query = query.eq("organisation_id", ctx.organisationId);
    if (statusParam) query = query.eq("status", statusParam);

    const { data, error } = await query;
    if (error) return jsonError("Failed to load referral payouts.", 500);

    return jsonSuccess({ payouts: data ?? [] });
  } catch (err) {
    return handleApiError(err, "Failed to load referral payouts", {
      route: "GET /api/referrals/payouts",
    });
  }
}

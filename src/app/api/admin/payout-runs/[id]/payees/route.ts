import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthContext, requireAuth, hasRole, jsonError, handleApiError } from "@/lib/api-helpers";
import { toCsv, csvResponseHeaders } from "@/lib/csv/to-csv";
import { logger } from "@/lib/observability/logger";

/**
 * GET /api/admin/payout-runs/[id]/payees — the sheet the operator pays from.
 *
 * TigerHire-internal and deliberately narrow: who to pay, where, how much. It
 * carries UPI IDs, so it is super_admin only and never reaches the company —
 * the company's statement of the same run omits payee bank details entirely.
 *
 * Rows are grouped per referrer: one referrer owed three bonuses is one
 * transfer, not three, and three transfers is how a referrer gets paid twice
 * when one of them silently fails.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const { id: batchId } = await params;
    const admin = createSupabaseAdmin();

    const { data: batch } = await admin
      .from("payout_batches")
      .select("reference")
      .eq("id", batchId)
      .maybeSingle();
    if (!batch) return jsonError("Payout run not found", 404);

    const { data, error } = await admin
      .from("payout_export")
      .select(
        "referrer_id, referrer_name, referrer_upi_id, referrer_whatsapp_number, amount, currency",
      )
      .eq("batch_id", batchId)
      .limit(5000);
    if (error) return jsonError("Failed to build payee sheet.", 500);

    const byReferrer = new Map<string, Record<string, unknown>>();
    for (const row of data ?? []) {
      const key = String(row.referrer_id ?? "");
      if (!key) continue;
      const amount = Number(row.amount ?? 0);
      const existing = byReferrer.get(key);
      if (existing) {
        existing.amount = Number(existing.amount) + (Number.isFinite(amount) ? amount : 0);
        existing.bonus_count = Number(existing.bonus_count) + 1;
        continue;
      }
      byReferrer.set(key, {
        referrer_name: row.referrer_name,
        referrer_upi_id: row.referrer_upi_id,
        referrer_whatsapp_number: row.referrer_whatsapp_number,
        amount: Number.isFinite(amount) ? amount : 0,
        currency: row.currency,
        bonus_count: 1,
      });
    }

    const rows = [...byReferrer.values()];
    const missingUpi = rows.filter((r) => !r.referrer_upi_id).length;
    if (missingUpi > 0) {
      logger.warn("payout run payee sheet has referrers without a UPI id", {
        reference: batch.reference,
        missingUpi,
      });
    }

    const csv = toCsv(["Referrer", "UPI ID", "WhatsApp", "Amount", "Currency", "Bonuses"], rows, [
      "referrer_name",
      "referrer_upi_id",
      "referrer_whatsapp_number",
      "amount",
      "currency",
      "bonus_count",
    ]);

    logger.info("payout run payee sheet exported", {
      userId: ctx.userId,
      reference: batch.reference,
      payees: rows.length,
    });

    return new NextResponse(csv, {
      status: 200,
      headers: csvResponseHeaders(`payees-${batch.reference}.csv`),
    });
  } catch (err) {
    return handleApiError(err, "Failed to build payee sheet", {
      route: "GET /api/admin/payout-runs/[id]/payees",
    });
  }
}

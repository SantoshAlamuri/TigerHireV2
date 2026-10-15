import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthContext, requireAuth, hasRole, jsonError } from "@/lib/api-helpers";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/observability/logger";
import { toCsv } from "@/lib/csv/to-csv";

const SELECT_COLS =
  "ledger_id, candidate_id, referrer_id, referrer_level, trigger_event, amount, currency, status, notes, created_at, updated_at, referrer_name, referrer_upi_id, referrer_whatsapp_number, candidate_name, candidate_email, direct_bonus_amount, parent_bonus_amount";

const CSV_KEYS = [
  "ledger_id",
  "candidate_id",
  "referrer_id",
  "referrer_level",
  "trigger_event",
  "amount",
  "currency",
  "status",
  "notes",
  "created_at",
  "updated_at",
  "referrer_name",
  "referrer_upi_id",
  "referrer_whatsapp_number",
  "candidate_name",
  "candidate_email",
  "direct_bonus_amount",
  "parent_bonus_amount",
];

/**
 * GET /api/admin/export/payouts — CSV from payout_export view, all orgs (super_admin only).
 * Optional: ?status=pending
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const rl = await checkRateLimit({
      key: `export-admin-payouts:${ctx.userId}`,
      limit: 5,
      windowSecs: 60,
    });
    if (!rl.allowed) {
      return jsonError("Rate limit exceeded. Please wait before exporting again.", 429);
    }

    const statusParam = request.nextUrl.searchParams.get("status")?.trim().toLowerCase();
    if (statusParam && statusParam !== "pending") {
      return jsonError("Invalid status filter. Use status=pending or omit for all statuses.", 400);
    }

    const supabase = createSupabaseAdmin();
    let query = supabase
      .from("payout_export")
      .select(SELECT_COLS)
      .order("created_at", { ascending: false })
      .limit(10_000);

    if (statusParam === "pending") {
      query = query.eq("status", "pending");
    }

    const { data, error } = await query;

    if (error) {
      logger.error("admin export payouts: query failed", { message: error.message });
      return jsonError("Export failed. Please try again later.", 500);
    }

    const merged = (data ?? []) as Record<string, unknown>[];

    const csv = toCsv(
      [
        "Ledger ID",
        "Candidate ID",
        "Referrer ID",
        "Referrer Level",
        "Trigger",
        "Amount",
        "Currency",
        "Status",
        "Notes",
        "Created At",
        "Updated At",
        "Referrer Name",
        "Referrer UPI",
        "Referrer WhatsApp",
        "Candidate Name",
        "Candidate Email",
        "Job Direct Bonus (config)",
        "Job Parent Bonus (config)",
      ],
      merged,
      CSV_KEYS,
    );

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `payouts-export-${timestamp}.csv`;

    logger.info("CSV export completed", {
      userId: ctx.userId,
      route: "GET /api/admin/export/payouts",
      filter: statusParam ?? "all",
    });

    const { error: auditError } = await supabase.from("audit_log").insert({
      organisation_id: null,
      actor_user_id: ctx.userId,
      actor_email: null,
      event_type: "export.admin.payouts",
      resource_type: "payout_export",
      resource_id: null,
      metadata: {
        route: "GET /api/admin/export/payouts",
        filter: statusParam ?? "all",
        row_count: merged.length,
      },
    });
    if (auditError) {
      logger.error("admin export payouts: audit log failed", { message: auditError.message });
      return jsonError("Export failed. Please try again later.", 500);
    }

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename=${filename}`,
      },
    });
  } catch (err) {
    logger.error("admin export payouts failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return jsonError("Export failed. Please try again later.", 500);
  }
}

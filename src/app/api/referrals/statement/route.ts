import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthContext, requireAuth, hasRole, jsonError, handleApiError } from "@/lib/api-helpers";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { toCsv, csvResponseHeaders } from "@/lib/csv/to-csv";
import { logger } from "@/lib/observability/logger";

/**
 * GET /api/referrals/statement?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * The company's referral payout statement, for finance.
 *
 * This is a record of what TigerHire already disbursed on this org's jobs — not
 * a payment instruction. That distinction drives every choice below:
 *
 *   * it reports `paid` rows, so a download is a settled fact and re-downloading
 *     it cannot cause anything to be paid twice. The old export returned every
 *     `pending` row on every download, forever;
 *   * it carries the job title, so finance can allocate cost to a role — the
 *     previous CSV had no job column at all;
 *   * it omits referrer UPI IDs and candidate emails. The company does not
 *     disburse, so payee bank details are not theirs to hold;
 *   * it is period-bounded, because it reconciles against an invoice.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function defaultRange(now: Date): { from: string; to: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin", "leadership", "finance")) {
      return jsonError("Forbidden", 403);
    }

    const rl = await checkRateLimit({
      key: `referral-statement:${ctx.userId}`,
      limit: 5,
      windowSecs: 60,
    });
    if (!rl.allowed) {
      return jsonError("Rate limit exceeded. Please wait before exporting again.", 429);
    }

    const params = request.nextUrl.searchParams;
    const fallback = defaultRange(new Date());
    const from = params.get("from")?.trim() || fallback.from;
    const to = params.get("to")?.trim() || fallback.to;
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      return jsonError("Invalid date range. Use from=YYYY-MM-DD&to=YYYY-MM-DD.", 400);
    }
    if (from >= to) return jsonError("`from` must be earlier than `to`.", 400);

    const isSuperAdmin = hasRole(ctx, "super_admin");
    if (!isSuperAdmin && !ctx.organisationId) {
      return jsonError("No organisation in context.", 403);
    }

    const admin = createSupabaseAdmin();
    let query = admin
      .from("payout_export")
      .select(
        "paid_at, batch_reference, payment_reference, job_title, candidate_name, referrer_name, referrer_level, trigger_event, amount, currency",
      )
      .eq("status", "paid")
      .gte("paid_at", `${from}T00:00:00Z`)
      .lt("paid_at", `${to}T00:00:00Z`)
      .order("paid_at", { ascending: false })
      .limit(5000);

    if (!isSuperAdmin) query = query.eq("organisation_id", ctx.organisationId);

    const { data, error } = await query;
    if (error) {
      logger.error("referral statement: query failed", { message: error.message });
      return jsonError("Export failed. Please try again later.", 500);
    }

    const rows = (data ?? []) as Record<string, unknown>[];
    const total = rows.reduce((sum, r) => {
      const amt = Number(r.amount ?? 0);
      return sum + (Number.isFinite(amt) ? amt : 0);
    }, 0);

    // The total is a row rather than a separate endpoint: this file is opened in
    // a spreadsheet by someone reconciling one number against an invoice.
    const withTotal = [
      ...rows,
      {
        paid_at: "",
        batch_reference: "",
        payment_reference: "",
        job_title: "",
        candidate_name: "",
        referrer_name: "",
        referrer_level: "",
        trigger_event: "TOTAL",
        amount: total.toFixed(2),
        currency: rows[0]?.currency ?? "INR",
      },
    ];

    const csv = toCsv(
      [
        "Paid On",
        "Payout Run",
        "Payment Reference",
        "Job",
        "Candidate",
        "Referrer",
        "Referrer Level",
        "Milestone",
        "Amount",
        "Currency",
      ],
      withTotal,
      [
        "paid_at",
        "batch_reference",
        "payment_reference",
        "job_title",
        "candidate_name",
        "referrer_name",
        "referrer_level",
        "trigger_event",
        "amount",
        "currency",
      ],
    );

    await admin.from("audit_log").insert({
      organisation_id: ctx.organisationId ?? null,
      actor_user_id: ctx.userId,
      event_type: "export.referral.statement",
      resource_type: "payout_export",
      resource_id: null,
      metadata: { from, to, row_count: rows.length, total },
    });

    logger.info("referral statement exported", {
      userId: ctx.userId,
      from,
      to,
      rows: rows.length,
    });

    return new NextResponse(csv, {
      status: 200,
      headers: csvResponseHeaders(`referral-statement-${from}-to-${to}.csv`),
    });
  } catch (err) {
    return handleApiError(err, "Failed to export referral statement", {
      route: "GET /api/referrals/statement",
    });
  }
}

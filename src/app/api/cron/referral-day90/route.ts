import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { validateCronSecret } from "@/lib/security/cron-auth";
import { logger } from "@/lib/observability/logger";
import { runDay90Sweep } from "@/lib/referrals/day90-sweep";

/**
 * GET /api/cron/referral-day90 — the clock the day-90 milestone never had.
 *
 * Creates payout_ledger rows for hires that reached ninety days since their
 * recorded joining date on a job configured to pay on that milestone. Idempotent
 * by way of the ledger's unique index, so a re-run is harmless.
 */
export async function GET(request: NextRequest) {
  if (!(await validateCronSecret(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdmin();

  try {
    const result = await runDay90Sweep(admin, new Date());
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("day-90 referral sweep failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: false, error: "Sweep failed" }, { status: 500 });
  }
}

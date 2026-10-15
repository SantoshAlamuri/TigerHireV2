import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { validateCronSecret } from "@/lib/security/cron-auth";
import { acquireCronLease, releaseCronLease } from "@/lib/security/cron-lease";
import { sweepPendingPrescreens } from "@/lib/prescreen/pending-sweep";
import { sweepDuePrescreenReminders } from "@/lib/prescreen/reminder-sweep";
import { logger } from "@/lib/observability/logger";
import { reportError } from "@/lib/observability/report-error";

const JOB_NAME = "prescreen-sweep";

/**
 * POST /api/cron/prescreen-sweep
 * Safety net for the per-channel prescreen gate: force-resolves sessions still
 * open past (timeout + buffer) hours, in case an Inngest lifecycle event was
 * dropped or never scheduled. Auth: CRON_SECRET (Bearer).
 */
export async function POST(request: NextRequest) {
  if (!(await validateCronSecret(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const leaseOwner = await acquireCronLease(JOB_NAME, 10 * 60);
  if (!leaseOwner) {
    return NextResponse.json({ skipped: true, reason: "lock-held", job: JOB_NAME });
  }

  try {
    const admin = createSupabaseAdmin();
    const reminders = await sweepDuePrescreenReminders(admin);
    const result = await sweepPendingPrescreens(admin);
    logger.info("[cron] prescreen-sweep complete", { reminders, ...result });
    return NextResponse.json({ reminders, ...result });
  } catch (err) {
    reportError(err, { route: "POST /api/cron/prescreen-sweep" });
    return NextResponse.json({ error: "Prescreen sweep failed" }, { status: 500 });
  } finally {
    await releaseCronLease(JOB_NAME, leaseOwner);
  }
}

export { POST as GET };

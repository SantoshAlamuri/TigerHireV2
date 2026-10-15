import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { validateCronSecret } from "@/lib/security/cron-auth";
import { acquireCronLease, releaseCronLease } from "@/lib/security/cron-lease";
import { reconcileUnscoredApplications } from "@/lib/fitscore/unscored-reconciliation";
import { logger } from "@/lib/observability/logger";
import { reportError } from "@/lib/observability/report-error";
import { sendOpsAlert } from "@/lib/observability/alerts";

const JOB_NAME = "unscored-reconciliation";

/**
 * POST /api/cron/unscored-reconciliation
 * Safety net for "every applicant is scored": finds applications with no active
 * fit_score and re-enqueues them. Before this existed, a dropped candidate (lock
 * failure, budget trip, enqueue no-op, truncated batch) was permanent and silent.
 * Auth: CRON_SECRET (Bearer).
 */
export async function POST(request: NextRequest) {
  if (!(await validateCronSecret(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let leaseOwner: string | null = null;
  try {
    leaseOwner = await acquireCronLease(JOB_NAME, 10 * 60);
  } catch (err) {
    reportError(err, { route: "POST /api/cron/unscored-reconciliation (lease)" });
    return NextResponse.json({ error: "Could not acquire cron lease" }, { status: 500 });
  }
  if (!leaseOwner) {
    return NextResponse.json({ skipped: true, reason: "lock-held", job: JOB_NAME });
  }

  try {
    const admin = createSupabaseAdmin();
    const result = await reconcileUnscoredApplications(admin, { limit: 500 });
    logger.info("[cron] unscored-reconciliation complete", { ...result });

    // A large backlog means a systemic drop, not the odd transient failure.
    if (result.outstanding >= 25 || result.exhausted > 0) {
      await sendOpsAlert(
        `FitScore reconciliation: ${result.outstanding} unscored applications ` +
          `(requeued ${result.requeued}, enqueue failures ${result.failed}, ` +
          `${result.exhausted} exhausted after repeated attempts — these need a human).`,
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    reportError(err, { route: "POST /api/cron/unscored-reconciliation" });
    return NextResponse.json({ error: "Unscored reconciliation failed" }, { status: 500 });
  } finally {
    await releaseCronLease(JOB_NAME, leaseOwner);
  }
}

export { POST as GET };

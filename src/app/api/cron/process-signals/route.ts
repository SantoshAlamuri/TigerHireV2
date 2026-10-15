import { NextRequest, NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/security/cron-auth";
import { processUnprocessedSignals } from "@/lib/agents/talent-scout";
import { logger } from "@/lib/observability/logger";
import { reportError } from "@/lib/observability/report-error";

/**
 * POST /api/cron/process-signals
 * Triggered by Vercel Cron or external scheduler.
 * Auth: CRON_SECRET or CRON_SECRET_HASH (SHA-256 hex) in Bearer header.
 */
export async function POST(request: NextRequest) {
  if (!(await validateCronSecret(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processUnprocessedSignals(100);
    return NextResponse.json({
      runId: result.runId,
      processed: result.recordsProcessed,
      created: result.recordsCreated,
      updated: result.recordsUpdated,
      errors: result.errors.length,
    });
  } catch (err) {
    reportError(err, { route: "POST /api/cron/process-signals" });
    return NextResponse.json({ error: "Signal processing failed" }, { status: 500 });
  }
}

export { POST as GET };

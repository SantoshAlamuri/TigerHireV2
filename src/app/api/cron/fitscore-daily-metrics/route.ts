import { NextRequest, NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/security/cron-auth";
import { runFitScoreDailyMetricsJob } from "@/lib/fitscore/scoring-daily-metrics";
import { reportError } from "@/lib/observability/report-error";
import { sendOpsAlert } from "@/lib/observability/alerts";

/**
 * POST /api/cron/fitscore-daily-metrics
 * Aggregates yesterday's FitScore Claude spend and guard events; logs JSON summary.
 * Optional query: ?date=YYYY-MM-DD (UTC day).
 */
export async function POST(request: NextRequest) {
  if (!(await validateCronSecret(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const dateParam = request.nextUrl.searchParams.get("date") ?? undefined;
    const summary = await runFitScoreDailyMetricsJob(dateParam ?? undefined);
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    reportError(err, { route: "POST /api/cron/fitscore-daily-metrics" });
    void sendOpsAlert(
      `FitScore daily metrics cron failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return NextResponse.json({ error: "FitScore daily metrics failed" }, { status: 500 });
  }
}

export { POST as GET };

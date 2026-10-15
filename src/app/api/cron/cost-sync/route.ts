import { NextRequest, NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/security/cron-auth";
import { syncAllPlatformCosts } from "@/lib/costs/sync";
import { reportError } from "@/lib/observability/report-error";

/**
 * POST /api/cron/cost-sync
 * Pulls spend data from external providers and upserts into platform_cost_events.
 */
export async function POST(request: NextRequest) {
  if (!(await validateCronSecret(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const to = new Date();
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
    const results = await syncAllPlatformCosts({ from, to });
    return NextResponse.json({
      synced: true,
      window: { from: from.toISOString(), to: to.toISOString() },
      results,
    });
  } catch (err) {
    reportError(err, { route: "POST /api/cron/cost-sync" });
    return NextResponse.json({ error: "Cost sync failed" }, { status: 500 });
  }
}

export { POST as GET };

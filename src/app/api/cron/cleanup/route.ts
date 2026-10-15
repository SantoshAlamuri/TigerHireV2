import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { validateCronSecret } from "@/lib/security/cron-auth";
import { enqueueAfterResponse } from "@/lib/jobs/enqueue-after-response";
import { logger } from "@/lib/observability/logger";

/**
 * POST /api/cron/cleanup
 * Runs weekly. Marks JDs as closed if they have been inactive (e.g. no shortlist delivery in 90 days).
 * Auth: CRON_SECRET or CRON_SECRET_HASH (SHA-256 hex) in Bearer header.
 */
export async function POST(request: NextRequest) {
  if (!(await validateCronSecret(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const { data: stale, error: staleErr } = await supabase
    .from("jobs")
    .select("id")
    .eq("status", "open")
    .lt("updated_at", cutoff.toISOString())
    .limit(100);

  if (staleErr) {
    // A failed read must not masquerade as "nothing stale".
    logger.error("Cleanup cron: stale-jobs query failed", { error: staleErr.message });
    return NextResponse.json({ error: "stale query failed" }, { status: 500 });
  }

  if (!stale?.length) {
    return NextResponse.json({ closed: 0 });
  }

  const jobIds = (stale as { id: string }[]).map((r) => r.id);
  const { error: closeErr } = await supabase
    .from("jobs")
    .update({ status: "closed", updated_at: new Date().toISOString() })
    .in("id", jobIds);

  if (closeErr) {
    // Don't enqueue board-removal for jobs that may still be open internally.
    logger.error("Cleanup cron: bulk close failed — skipping board removal", {
      error: closeErr.message,
      jobCount: jobIds.length,
    });
    return NextResponse.json({ error: "close failed", closed: 0 }, { status: 500 });
  }

  for (const jobId of jobIds) {
    enqueueAfterResponse("job-remove-from-boards", { jobId });
  }

  return NextResponse.json({ closed: jobIds.length });
}

export { POST as GET };

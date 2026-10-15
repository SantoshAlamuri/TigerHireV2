import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { validateCronSecret } from "@/lib/security/cron-auth";
import { acquireCronLease, releaseCronLease } from "@/lib/security/cron-lease";
import { runFitScoreBatchAgent } from "@/lib/agents/fitscore-agent";
import { logger } from "@/lib/observability/logger";
import { reportError } from "@/lib/observability/report-error";
import { captureSentryMessage } from "@/lib/observability/sentry";

const JOB_NAME = "score-batch";

/**
 * POST /api/cron/score-batch
 * Triggered by Vercel Cron or external scheduler.
 * Auth: CRON_SECRET or CRON_SECRET_HASH (SHA-256 hex of secret) in Bearer header.
 */
export async function POST(request: NextRequest) {
  if (!(await validateCronSecret(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdmin();
  const leaseOwner = await acquireCronLease(JOB_NAME, 20 * 60);
  if (!leaseOwner) {
    captureSentryMessage("Cron lease contention for score-batch", "warning", {
      tags: { route: "/api/cron/score-batch", event: "lock-held" },
      extra: { job: JOB_NAME },
    });
    return NextResponse.json({
      skipped: true,
      reason: "lock-held",
      job: JOB_NAME,
    });
  }
  let runId: string | null = null;
  let runClosed = false;

  const closeCronRun = async (
    status: "success" | "failure",
    extra: {
      rows_processed?: number;
      metadata?: Record<string, unknown>;
      error_message?: string;
    } = {},
  ) => {
    if (!runId || runClosed) return;
    runClosed = true;
    await admin
      .from("cron_runs")
      .update({
        finished_at: new Date().toISOString(),
        status,
        ...extra,
      })
      .eq("id", runId);
  };

  {
    // supabase-js returns errors, it does not throw — the old try/catch was dead
    // code, so an insert failure silently yielded runId=null and no audit row.
    const { data: run, error: runErr } = await admin
      .from("cron_runs")
      .insert({
        job_name: JOB_NAME,
        status: "running",
      })
      .select("id")
      .single();
    if (runErr) {
      logger.error("cron_runs insert failed, continuing without audit", {
        err: runErr.message,
      });
    }
    runId = run?.id ?? null;
  }

  try {
    const result = await runFitScoreBatchAgent({ maxPairs: 200 });
    await closeCronRun("success", {
      rows_processed: result.recordsProcessed,
      metadata: {
        runId: result.runId,
        created: result.recordsCreated,
        errors: result.errors.length,
      },
    });
    return NextResponse.json({
      runId: result.runId,
      processed: result.recordsProcessed,
      created: result.recordsCreated,
      errors: result.errors.length,
    });
  } catch (err) {
    reportError(err, { route: "POST /api/cron/score-batch" });
    await closeCronRun("failure", {
      error_message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Batch scoring failed" }, { status: 500 });
  } finally {
    if (runId && !runClosed) {
      try {
        await closeCronRun("failure", {
          error_message: "score-batch exited before run was closed (timeout or abrupt termination)",
        });
      } catch (closeErr) {
        logger.warn("cron_runs close failed in finally", { err: String(closeErr), runId });
      }
    }
    await releaseCronLease(JOB_NAME, leaseOwner);
  }
}

export { POST as GET };

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { validateCronSecret } from "@/lib/security/cron-auth";
import { logger } from "@/lib/observability/logger";
import { reportError } from "@/lib/observability/report-error";

/**
 * GET /api/cron/resignations
 * Fallback for pg_cron: process pending resignations where 48hr hold has elapsed.
 * Auth: CRON_SECRET or CRON_SECRET_HASH (SHA-256 hex) in Bearer header.
 */
export async function GET(request: NextRequest) {
  if (!(await validateCronSecret(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdmin();

    const { data: pending, error: pendingErr } = await supabase
      .from("resignation_events")
      .select("id, candidate_id")
      .eq("disputed", false)
      .lte("profile_unlock_scheduled_at", new Date().toISOString())
      .is("profile_unlocked_at", null);

    if (pendingErr) {
      // A failed read must NOT be reported as "nothing to do" — that silently
      // skips every due unlock.
      logger.error("Resignation cron: pending query failed", { error: pendingErr.message });
      return NextResponse.json({ error: "pending query failed" }, { status: 500 });
    }

    if (!pending || pending.length === 0) {
      return NextResponse.json({ processed: 0 });
    }

    let processed = 0;
    let failed = 0;
    for (const event of pending) {
      const nowIso = new Date().toISOString();
      const { error: candErr } = await supabase
        .from("candidates")
        .update({
          employment_status: "alumni",
          profile_unlocked_at: nowIso,
        })
        .eq("id", event.candidate_id);

      if (candErr) {
        // Do NOT stamp the event as unlocked when the candidate update failed —
        // otherwise the 48h unlock is permanently skipped (event looks done,
        // candidate never becomes alumni). Leave it pending for the next run.
        logger.error("Resignation cron: candidate unlock failed — leaving event pending", {
          candidateId: event.candidate_id,
          eventId: event.id,
          error: candErr.message,
        });
        failed++;
        continue;
      }

      const { error: eventErr } = await supabase
        .from("resignation_events")
        .update({ profile_unlocked_at: nowIso })
        .eq("id", event.id);
      if (eventErr) {
        logger.error("Resignation cron: event stamp failed (candidate already unlocked)", {
          eventId: event.id,
          error: eventErr.message,
        });
      }

      processed++;
    }

    logger.info("Resignation cron processed", {
      message: `${processed} profiles unlocked`,
      failed,
    });
    return NextResponse.json({ processed, failed });
  } catch (err) {
    reportError(err, { route: "GET /api/cron/resignations" });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

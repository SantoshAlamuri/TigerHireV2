import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { validateCronSecret } from "@/lib/security/cron-auth";
import { CandidateService } from "@/lib/services/CandidateService";
import { logger } from "@/lib/observability/logger";

const BATCH_LIMIT = 100;

/**
 * POST /api/cron/privacy-retention
 * Processes pending erasure requests to avoid manual-only execution.
 */
export async function POST(request: Request) {
  try {
    const authorized = await validateCronSecret(request);
    if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createSupabaseAdmin();
    const { data: pending, error } = await admin
      .from("erasure_requests")
      .select("id, candidate_id, phone")
      .eq("status", "pending")
      // Column is `created_at`; ordering by a non-existent `requested_at` made this
      // cron 500 on every run, so no erasure request was ever processed.
      .order("created_at", { ascending: true })
      .limit(BATCH_LIMIT);

    if (error) {
      logger.error("privacy-retention: failed loading pending requests", { error: String(error) });
      return NextResponse.json({ error: "Failed to load pending erasures" }, { status: 500 });
    }

    let processed = 0;
    let skipped = 0;
    let failed = 0;
    for (const row of pending ?? []) {
      const requestId = String(row.id);
      let candidateId = (row.candidate_id as string | null) ?? null;
      if (!candidateId && row.phone) {
        const { data: candidate } = await admin
          .from("candidates")
          .select("id")
          .eq("phone", String(row.phone))
          .maybeSingle();
        candidateId = (candidate?.id as string | undefined) ?? null;
      }

      if (!candidateId) {
        // Distinct, greppable event: an erasure request with no matching candidate
        // is silently re-skipped every run while the DPDP clock keeps running.
        // Surface it so it can be escalated rather than looping forever.
        logger.warn(
          "privacy-retention: erasure request has no matching candidate — needs manual review",
          {
            request_id: requestId,
          },
        );
        skipped += 1;
        continue;
      }

      try {
        // Preserve identity before erasure clears the phone used by phone-only requests.
        const { error: linkError } = await admin
          .from("erasure_requests")
          .update({ candidate_id: candidateId })
          .eq("id", requestId);
        if (linkError) throw new Error("Could not retain erasure retry identity");
        await CandidateService.eraseData(admin, candidateId);
      } catch (eraseErr) {
        failed += 1;
        logger.warn("privacy-retention: candidate erase failed", {
          request_id: requestId,
          candidate_id: candidateId,
          error: String(eraseErr),
        });
        continue;
      }

      const { error: stampErr } = await admin
        .from("erasure_requests")
        .update({
          candidate_id: candidateId,
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", requestId);
      if (stampErr) {
        logger.error("privacy-retention: completion stamp failed after erase", {
          request_id: requestId,
          candidate_id: candidateId,
          error: stampErr.message,
        });
        failed += 1;
        continue;
      }
      processed += 1;
    }

    return NextResponse.json({
      ok: failed === 0,
      scanned: pending?.length ?? 0,
      processed,
      skipped,
      failed,
    });
  } catch (err) {
    logger.error("privacy-retention cron failed", { error: String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Vercel cron invocations are GET; without this the schedule never reached the handler.
export { POST as GET };

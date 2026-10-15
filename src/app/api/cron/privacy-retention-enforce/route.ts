import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { validateCronSecret } from "@/lib/security/cron-auth";
import { logger } from "@/lib/observability/logger";

/**
 * POST /api/cron/privacy-retention-enforce
 *
 * Enforces the per-org retention windows in `privacy_settings`
 * (recording_retention_days / transcript_retention_days) against
 * `interview_recordings`: nulls the stored recording/transcript pointers once a
 * row is older than its window, and records each purge in `retention_deletions`.
 *
 * SAFETY: **dry-run by default.** Without `?apply=true` it computes and reports
 * what WOULD be purged and writes nothing. This is deliberate — the cron is
 * scheduled in dry-run/report mode so the numbers can be reviewed before any
 * destructive run. To actually enforce, call with `?apply=true` (or change the
 * scheduled cron path to include it) after reviewing a dry-run.
 *
 * Note: this nulls TigerHire's stored pointers (the recording/transcript URLs
 * are short-lived Recall pre-signed links). `recall_bot_id` is retained so a
 * follow-up can also purge the media on Recall itself. (#351)
 */
const PER_ORG_LIMIT = 500;
const RetentionEnforceQuerySchema = z.object({
  apply: z.enum(["true", "false"]).optional(),
});

export async function POST(request: Request) {
  if (!(await validateCronSecret(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedQuery = RetentionEnforceQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsedQuery.success) {
    return NextResponse.json({ error: "Invalid retention enforcement query" }, { status: 400 });
  }

  const apply = parsedQuery.data.apply === "true";
  const admin = createSupabaseAdmin();

  const { data: settings, error: settingsErr } = await admin
    .from("privacy_settings")
    .select("organisation_id, recording_retention_days, transcript_retention_days");

  if (settingsErr) {
    logger.error("privacy-retention-enforce: failed to load privacy_settings", {
      error: settingsErr.message,
    });
    return NextResponse.json({ error: "settings query failed" }, { status: 500 });
  }

  const now = Date.now();
  const nowIso = new Date().toISOString();
  let orgsProcessed = 0;
  let recordingsPurged = 0;
  let transcriptsPurged = 0;
  let failures = 0;

  const cutoffIso = (days: number) => new Date(now - days * 86_400_000).toISOString();

  const logDeletion = async (
    reason: "retention_recording" | "retention_transcript",
    row: { id: string; pipeline_candidate_id?: string | null },
    retentionDays: number,
  ) => {
    const { error } = await admin.from("retention_deletions").insert({
      candidate_id: null,
      deletion_reason: reason,
      data_deleted: {
        interview_recording_id: row.id,
        pipeline_candidate_id: row.pipeline_candidate_id ?? null,
        retention_days: retentionDays,
      },
    });
    if (error) {
      logger.error("privacy-retention-enforce: retention_deletions insert failed", {
        reason,
        recordingId: row.id,
        error: error.message,
      });
    }
  };

  for (const s of settings ?? []) {
    orgsProcessed += 1;
    const orgId = s.organisation_id as string;
    const recDays = Number(s.recording_retention_days);
    const trDays = Number(s.transcript_retention_days);

    // --- Recordings past their window ---
    if (Number.isFinite(recDays) && recDays > 0) {
      const { data: rows, error } = await admin
        .from("interview_recordings")
        .select("id, pipeline_candidate_id")
        .eq("organisation_id", orgId)
        .lt("created_at", cutoffIso(recDays))
        .not("recording_url", "is", null)
        .limit(PER_ORG_LIMIT);
      if (error) {
        logger.error("privacy-retention-enforce: recordings query failed", {
          orgId,
          error: error.message,
        });
        failures += 1;
      } else {
        for (const row of rows ?? []) {
          if (apply) {
            const { error: upErr } = await admin
              .from("interview_recordings")
              .update({ recording_url: null, updated_at: nowIso })
              .eq("id", row.id as string);
            if (upErr) {
              logger.error("privacy-retention-enforce: recording purge failed", {
                recordingId: row.id,
                error: upErr.message,
              });
              failures += 1;
              continue;
            }
            await logDeletion("retention_recording", row, recDays);
          }
          recordingsPurged += 1;
        }
      }
    }

    // --- Transcripts past their window ---
    if (Number.isFinite(trDays) && trDays > 0) {
      const { data: rows, error } = await admin
        .from("interview_recordings")
        .select("id, pipeline_candidate_id")
        .eq("organisation_id", orgId)
        .lt("created_at", cutoffIso(trDays))
        .not("transcript_url", "is", null)
        .limit(PER_ORG_LIMIT);
      if (error) {
        logger.error("privacy-retention-enforce: transcripts query failed", {
          orgId,
          error: error.message,
        });
        failures += 1;
      } else {
        for (const row of rows ?? []) {
          if (apply) {
            const { error: upErr } = await admin
              .from("interview_recordings")
              .update({ transcript_url: null, summary_json: null, updated_at: nowIso })
              .eq("id", row.id as string);
            if (upErr) {
              logger.error("privacy-retention-enforce: transcript purge failed", {
                recordingId: row.id,
                error: upErr.message,
              });
              failures += 1;
              continue;
            }
            await logDeletion("retention_transcript", row, trDays);
          }
          transcriptsPurged += 1;
        }
      }
    }
  }

  logger.info("privacy-retention-enforce complete", {
    dryRun: !apply,
    orgsProcessed,
    recordingsPurged,
    transcriptsPurged,
    failures,
  });

  return NextResponse.json({
    dryRun: !apply,
    orgsProcessed,
    recordingsPurged,
    transcriptsPurged,
    failures,
  });
}

export { POST as GET };

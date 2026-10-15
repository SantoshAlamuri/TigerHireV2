import { NextRequest, after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { handleApiError, jsonError, jsonSuccess } from "@/lib/api-helpers";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";
import { withCorrelation } from "@/lib/observability/with-correlation";
import { withRouteSpan } from "@/lib/observability/route-span";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  fetchRecallBotArtifacts,
  normalizeRecallStatus,
  verifyRecallWebhookSignature,
} from "@/lib/integrations/notetaker/recall";
import { extractInterviewSummary } from "@/lib/interviews/extract-interview-summary";

type JsonRecord = Record<string, unknown>;

type RecordingRow = {
  id: string;
  organisation_id: string;
  job_id: string | null;
  pipeline_candidate_id: string | null;
  recall_bot_id: string | null;
  status: string;
};

// Only true LOCAL development (`next dev`) may bypass signature verification.
// Preview/staging deploys share the production Supabase project, so a bypass
// there is a real unauthenticated-write hole — they must present a valid
// signature or fallback secret like production does.
function isLocalDev(): boolean {
  return process.env.NODE_ENV === "development" && !process.env.VERCEL_ENV;
}

function timingSafeStrEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function hasValidFallbackHeader(request: NextRequest): boolean {
  const configured = env.recallWebhookFallbackSecret.trim();
  if (!configured) return false;
  const received = (request.headers.get("x-tigerhire-webhook-secret") ?? "").trim();
  return received.length > 0 && timingSafeStrEqual(received, configured);
}

function isWebhookAuthValid(request: NextRequest, rawBody: string): boolean {
  // Recall sends `svix-*` headers for legacy per-endpoint Svix secrets and `webhook-*` headers
  // for workspace verification secrets (accounts created after 2025-12-15). Same scheme, so
  // accept either alias.
  const ok = verifyRecallWebhookSignature(rawBody, {
    id: request.headers.get("svix-id") ?? request.headers.get("webhook-id"),
    timestamp: request.headers.get("svix-timestamp") ?? request.headers.get("webhook-timestamp"),
    signature: request.headers.get("svix-signature") ?? request.headers.get("webhook-signature"),
  });
  if (ok) return true;
  if (hasValidFallbackHeader(request)) return true;
  if (isLocalDev()) {
    logger.warn("Recall webhook signature bypass enabled in local development only");
    return true;
  }
  return false;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" ? (value as JsonRecord) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function pick(payload: JsonRecord, paths: string[][]): string {
  for (const path of paths) {
    let cursor: unknown = payload;
    for (const segment of path) {
      cursor = asRecord(cursor)[segment];
    }
    const value = asString(cursor);
    if (value) return value;
  }
  return "";
}

async function processDoneRecording(recording: RecordingRow, botId: string): Promise<void> {
  const admin = createSupabaseAdmin();
  try {
    const artifacts = await fetchRecallBotArtifacts(botId);

    // Persist the transcript text to the existing screening-audio bucket for later review.
    let transcriptPath: string | null = null;
    if (artifacts.transcript.trim()) {
      const path = `interview-transcripts/${recording.organisation_id}/${recording.id}.txt`;
      const { error } = await admin.storage
        .from("screening-audio")
        .upload(path, Buffer.from(artifacts.transcript, "utf8"), {
          upsert: true,
          contentType: "text/plain",
        });
      if (!error) transcriptPath = path;
    }

    let job: { title: string | null; description: string | null } | null = null;
    if (recording.job_id) {
      const { data } = await admin
        .from("jobs")
        .select("title, description")
        .eq("id", recording.job_id)
        .maybeSingle<{ title: string | null; description: string | null }>();
      job = data ?? null;
    }

    const summary = artifacts.transcript.trim()
      ? await extractInterviewSummary({
          context: {
            roleTitle: job?.title ?? "Interview",
            jdSummary: job?.description ?? null,
            transcript: artifacts.transcript,
          },
          attribution: {
            organisationId: recording.organisation_id,
            jobId: recording.job_id ?? undefined,
          },
        })
      : null;

    const durationHours = artifacts.duration_seconds / 3600;
    const costUsd = Number((durationHours * env.recallInternalCostUsdPerHour).toFixed(4));

    await admin
      .from("interview_recordings")
      .update({
        status: "done",
        recording_url: artifacts.recording_url || null,
        transcript_url: transcriptPath,
        summary_json: summary,
        duration_seconds: artifacts.duration_seconds,
        cost_usd: costUsd,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recording.id);

    logger.info("notetaker_recording_completed", {
      recordingId: recording.id,
      organisationId: recording.organisation_id,
      hasSummary: Boolean(summary),
    });
  } catch (err) {
    await admin
      .from("interview_recordings")
      .update({
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        updated_at: new Date().toISOString(),
      })
      .eq("id", recording.id);
    logger.error("notetaker_recording_processing_failed", {
      recordingId: recording.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export const POST = withCorrelation(async (request: NextRequest) =>
  withRouteSpan("POST /api/webhooks/recall", async () => {
    try {
      const rawBody = await request.text();
      if (!isWebhookAuthValid(request, rawBody)) {
        return jsonError("Invalid signature", 401);
      }

      let payload: JsonRecord;
      try {
        payload = asRecord(JSON.parse(rawBody));
      } catch {
        return jsonError("Invalid JSON body", 400);
      }

      const admin = createSupabaseAdmin();

      // Idempotency: prefer the unique Svix delivery id, else derive from bot+status.
      const botId = pick(payload, [
        ["data", "bot", "id"],
        ["data", "bot_id"],
        ["bot", "id"],
        ["data", "id"],
      ]);
      // Recall's bot status-change payload carries the bare code at data.data.code and the
      // prefixed name at top-level event (e.g. "bot.done"); prefer the bare code.
      const rawStatus = pick(payload, [
        ["data", "data", "code"],
        ["data", "status", "code"],
        ["data", "status"],
        ["status", "code"],
        ["status"],
        ["event"],
      ]);
      const eventId =
        request.headers.get("svix-id")?.trim() ||
        request.headers.get("webhook-id")?.trim() ||
        `recall:${botId || "no_bot"}:${rawStatus || "no_status"}`;
      const acquired = await admin.rpc("webhook_event_try_acquire", {
        p_provider: "recall",
        p_event_id: eventId,
      });
      if (acquired.data === false) {
        return jsonSuccess({ received: true, duplicate: true });
      }

      const recordingId = pick(payload, [
        ["data", "bot", "metadata", "recording_id"],
        ["data", "metadata", "recording_id"],
        ["metadata", "recording_id"],
      ]);

      // Resolve the ledger row by recording_id metadata, falling back to the bot id.
      let recording: RecordingRow | null = null;
      if (recordingId) {
        const { data } = await admin
          .from("interview_recordings")
          .select("id, organisation_id, job_id, pipeline_candidate_id, recall_bot_id, status")
          .eq("id", recordingId)
          .maybeSingle<RecordingRow>();
        recording = data ?? null;
      }
      if (!recording && botId) {
        const { data } = await admin
          .from("interview_recordings")
          .select("id, organisation_id, job_id, pipeline_candidate_id, recall_bot_id, status")
          .eq("recall_bot_id", botId)
          .maybeSingle<RecordingRow>();
        recording = data ?? null;
      }
      if (!recording) {
        return jsonSuccess({ received: true, ignored: "recording_not_found" });
      }
      if (recording.status === "done") {
        return jsonSuccess({ received: true, ignored: "already_terminal" });
      }

      const normalized = normalizeRecallStatus(rawStatus);
      const resolvedBotId = botId || recording.recall_bot_id || "";

      if (normalized === "done") {
        if (!resolvedBotId) return jsonError("Missing Recall bot id", 400);
        // Defer artifact fetch + Claude summary so we return 200 inside the webhook window.
        after(async () => {
          await processDoneRecording(recording!, resolvedBotId);
        });
        return jsonSuccess({ received: true, status: "processing" });
      }

      if (normalized === "no_show" || normalized === "failed") {
        await admin
          .from("interview_recordings")
          .update({ status: normalized, updated_at: new Date().toISOString() })
          .eq("id", recording.id);
        return jsonSuccess({ received: true, status: normalized });
      }

      // In-progress lifecycle event — reflect that the bot is live.
      if (recording.status === "queued" || recording.status === "joining") {
        await admin
          .from("interview_recordings")
          .update({ status: "in_call", updated_at: new Date().toISOString() })
          .eq("id", recording.id);
      }
      return jsonSuccess({ received: true, status: "in_call" });
    } catch (err) {
      logger.error("Recall webhook processing failed", {
        route: "POST /api/webhooks/recall",
        error: err instanceof Error ? err.message : String(err),
      });
      return handleApiError(err, "Recall webhook processing failed", {
        route: "POST /api/webhooks/recall",
      });
    }
  }),
);

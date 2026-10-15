import { NextRequest } from "next/server";
import { handleApiError, jsonError, jsonSuccess } from "@/lib/api-helpers";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";
import { withCorrelation } from "@/lib/observability/with-correlation";
import { withRouteSpan } from "@/lib/observability/route-span";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { extractScreeningSummary } from "@/lib/screening/extract-summary";
import { fetchBolnaCallArtifacts, verifyBolnaWebhookSignature } from "@/lib/screening/voice/bolna";

type JsonRecord = Record<string, unknown>;
type ScreeningJobRow = {
  id: string;
  organisation_id: string;
  candidate_id: string;
  req_id: string;
  mode: string;
  status: string;
  bolna_call_id: string | null;
};

const TERMINAL_STATUSES = new Set(["completed", "failed", "no_response", "cancelled", "skipped"]);
const COMPLETED_STATUSES = new Set(["completed", "success", "ended", "done"]);
const NO_ANSWER_STATUSES = new Set([
  "no_answer",
  "no-answer",
  "noanswer",
  "busy",
  "missed",
  "unanswered",
]);
// Bolna fires the webhook on every status transition; these are in-flight states that must be
// acknowledged without touching the screening job (marking them failed would kill live calls).
const IN_FLIGHT_STATUSES = new Set([
  "scheduled",
  "queued",
  "rescheduled",
  "initiated",
  "ringing",
  "in-progress",
  "in_progress",
  "call-disconnected",
  "call_disconnected",
]);

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function hasValidFallbackHeader(request: NextRequest): boolean {
  const configured = env.bolnaWebhookFallbackSecret.trim();
  if (!configured) return false;
  const received = (request.headers.get("x-tigerhire-webhook-secret") ?? "").trim();
  return received.length > 0 && received === configured;
}

/**
 * Bolna does not sign webhook deliveries (their only guidance is IP allowlisting), so the
 * primary production auth is a shared secret embedded in the webhook URL as `?secret=...`
 * (compared against BOLNA_WEBHOOK_SECRET). The HMAC check stays first in case Bolna ships
 * signatures later; the custom fallback header remains for manual testing.
 */
function hasValidQuerySecret(request: NextRequest): boolean {
  const configured = env.bolnaWebhookSecret.trim();
  if (!configured) return false;
  const received = (request.nextUrl.searchParams.get("secret") ?? "").trim();
  return received.length > 0 && received === configured;
}

function isWebhookAuthValid(
  request: NextRequest,
  rawBody: string,
  signature: string | null,
): boolean {
  if (verifyBolnaWebhookSignature(rawBody, signature)) return true;
  if (hasValidQuerySecret(request)) return true;
  if (hasValidFallbackHeader(request)) return true;
  if (isProductionRuntime()) return false;
  logger.warn("Bolna webhook signature bypass enabled in non-production runtime");
  return true;
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

function normalizeWebhookStatus(status: string): "completed" | "no_response" | "failed" {
  const normalized = status.toLowerCase();
  if (COMPLETED_STATUSES.has(normalized)) return "completed";
  if (NO_ANSWER_STATUSES.has(normalized)) return "no_response";
  return "failed";
}

function resolveEventId(request: NextRequest, payload: JsonRecord): string {
  const headerEventId = request.headers.get("x-bolna-event-id")?.trim();
  if (headerEventId) return headerEventId;
  const eventId = pick(payload, [["event_id"], ["id"], ["data", "event_id"]]);
  if (eventId) return eventId;
  const correlationId = resolveCorrelationId(payload) || "no_correlation";
  const status = resolveWebhookStatus(payload) || "no_status";
  const callId = resolveCallId(payload) || "no_call";
  return `${correlationId}:${status}:${callId}`;
}

function resolveCorrelationId(payload: JsonRecord): string {
  return pick(payload, [
    ["webhook_correlation_id"],
    ["correlation_id"],
    // Bolna webhook payload mirrors the Get Execution response: variables passed as
    // /call `user_data` come back under context_details.
    ["context_details", "webhook_correlation_id"],
    ["context_details", "recipient_data", "webhook_correlation_id"],
    ["user_data", "webhook_correlation_id"],
    ["user_data", "correlation_id"],
    ["data", "webhook_correlation_id"],
    ["data", "correlation_id"],
    ["data", "user_data", "webhook_correlation_id"],
    ["data", "user_data", "correlation_id"],
    ["metadata", "webhook_correlation_id"],
    ["metadata", "correlation_id"],
    ["data", "metadata", "webhook_correlation_id"],
    ["data", "metadata", "correlation_id"],
  ]);
}

function resolveCallId(payload: JsonRecord): string {
  return pick(payload, [
    ["execution_id"],
    ["call_id"],
    ["id"],
    ["data", "execution_id"],
    ["data", "call_id"],
    ["data", "id"],
  ]);
}

function resolveWebhookStatus(payload: JsonRecord): string {
  return pick(payload, [["status"], ["call_status"], ["data", "status"], ["data", "call_status"]]);
}

async function persistRemoteAudio(
  organisationId: string,
  jobId: string,
  sourceUrl: string,
): Promise<string | null> {
  if (!sourceUrl) return null;
  const res = await fetch(sourceUrl, { cache: "no-store" });
  if (!res.ok) return null;

  const bytes = await res.arrayBuffer();
  if (!bytes.byteLength) return null;

  const path = `screening-audio/${organisationId}/${jobId}.mp3`;
  const admin = createSupabaseAdmin();
  const { error } = await admin.storage
    .from("screening-audio")
    .upload(path, Buffer.from(bytes), { upsert: true, contentType: "audio/mpeg" });

  if (error) return null;
  return path;
}

async function persistTranscript(
  organisationId: string,
  jobId: string,
  transcript: string,
): Promise<string | null> {
  if (!transcript.trim()) return null;

  const path = `screening-audio/${organisationId}/${jobId}.txt`;
  const admin = createSupabaseAdmin();
  const { error } = await admin.storage
    .from("screening-audio")
    .upload(path, Buffer.from(transcript, "utf8"), { upsert: true, contentType: "text/plain" });

  if (error) return null;
  return path;
}

export const POST = withCorrelation(async (request: NextRequest) =>
  withRouteSpan("POST /api/screening/voice/webhook", async () => {
    try {
      const rawBody = await request.text();
      const signature = request.headers.get("x-bolna-signature");
      if (!isWebhookAuthValid(request, rawBody, signature)) {
        return jsonError("Invalid signature", 401);
      }

      let payload: JsonRecord;
      try {
        payload = asRecord(JSON.parse(rawBody));
      } catch {
        return jsonError("Invalid JSON body", 400);
      }

      const admin = createSupabaseAdmin();
      const eventId = resolveEventId(request, payload);
      const acquired = await admin.rpc("webhook_event_try_acquire", {
        p_provider: "bolna",
        p_event_id: eventId,
      });
      if (acquired.data === false) {
        return jsonSuccess({ received: true, duplicate: true });
      }

      const correlationId = resolveCorrelationId(payload);
      if (!correlationId) return jsonError("Missing webhook correlation id", 400);

      const { data: job, error: jobError } = await admin
        .from("screening_jobs")
        .select("id, organisation_id, candidate_id, req_id, mode, status, bolna_call_id")
        .eq("id", correlationId)
        .maybeSingle<ScreeningJobRow>();

      if (jobError) throw jobError;
      if (!job) return jsonSuccess({ received: true, ignored: "screening_job_not_found" });
      if (job.mode !== "voice") return jsonSuccess({ received: true, ignored: "non_voice_job" });

      if (TERMINAL_STATUSES.has(job.status)) {
        return jsonSuccess({ received: true, ignored: "already_terminal" });
      }

      const callId = resolveCallId(payload) || job.bolna_call_id || null;

      // Bolna webhooks fire on every transition (queued → ringing → in-progress → ...).
      // Acknowledge in-flight states without touching the job; just capture the call id.
      const rawWebhookStatus = resolveWebhookStatus(payload).toLowerCase();
      if (IN_FLIGHT_STATUSES.has(rawWebhookStatus)) {
        if (callId && !job.bolna_call_id) {
          await admin
            .from("screening_jobs")
            .update({ bolna_call_id: callId, updated_at: new Date().toISOString() })
            .eq("id", job.id);
        }
        return jsonSuccess({ received: true, status: "in_flight" });
      }

      const nextStatus = normalizeWebhookStatus(rawWebhookStatus);

      if (nextStatus !== "completed") {
        const patch: Record<string, unknown> = {
          status: nextStatus,
          ended_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (callId) patch.bolna_call_id = callId;
        const { error } = await admin.from("screening_jobs").update(patch).eq("id", job.id);
        if (error) throw error;
        return jsonSuccess({ received: true, status: nextStatus });
      }

      if (!callId) return jsonError("Missing Bolna call id", 400);

      const artifacts = await fetchBolnaCallArtifacts(callId);
      const artifactStatus =
        artifacts.status === "completed"
          ? "completed"
          : artifacts.status === "no_answer"
            ? "no_response"
            : "failed";

      if (artifactStatus !== "completed") {
        const { error } = await admin
          .from("screening_jobs")
          .update({
            status: artifactStatus,
            bolna_call_id: callId,
            ended_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
        if (error) throw error;
        return jsonSuccess({ received: true, status: artifactStatus });
      }

      const [audioPath, transcriptPath] = await Promise.all([
        persistRemoteAudio(job.organisation_id, job.id, artifacts.audio_url),
        persistTranscript(job.organisation_id, job.id, artifacts.transcript),
      ]);

      const roundedDuration = Math.max(0, Math.round(artifacts.duration_seconds));
      const durationMinutes = Math.max(1, Math.ceil(roundedDuration / 60));
      const costInr = durationMinutes * env.bolnaInternalCostInrPerMinute;
      const completionIso = new Date().toISOString();
      const { data: req } = await admin
        .from("jobs")
        .select("title, role_category, description")
        .eq("id", job.req_id)
        .maybeSingle<{
          title: string | null;
          role_category: string | null;
          description: string | null;
        }>();
      const summary = await extractScreeningSummary({
        context: {
          role_title: req?.title ?? "Role",
          role_category: req?.role_category as
            | "backend"
            | "frontend"
            | "data_ml"
            | "product"
            | "devops"
            | "design"
            | "sales"
            | "finance"
            | null,
          jd_summary: (req?.description ?? "").slice(0, 1200),
          transcript: artifacts.transcript,
          mode: "voice",
        },
        attribution: {
          organisationId: job.organisation_id,
          jobId: job.req_id,
          candidateId: job.candidate_id,
        },
      });

      const updatePatch: Record<string, unknown> = {
        p_job_id: job.id,
        p_organisation_id: job.organisation_id,
        p_bolna_call_id: callId,
        p_duration_seconds: roundedDuration,
        p_cost_inr: costInr,
        p_audio_url: null,
        p_transcript_url: null,
        p_summary_json: summary,
        p_recommendation: summary.recommendation,
        p_completed_at: completionIso,
      };
      if (audioPath) {
        updatePatch.p_audio_url = audioPath;
      } else if (artifacts.audio_url) {
        updatePatch.p_audio_url = artifacts.audio_url;
      }
      if (transcriptPath) {
        updatePatch.p_transcript_url = transcriptPath;
      }

      const { data: completedRows, error: updateError } = await admin.rpc(
        "complete_voice_screening_job",
        updatePatch,
      );
      if (updateError) throw updateError;
      if (!Array.isArray(completedRows) || completedRows.length === 0) {
        return jsonSuccess({
          received: true,
          ignored: "already_terminal_or_not_in_progress",
        });
      }

      return jsonSuccess({
        received: true,
        status: "completed",
      });
    } catch (err) {
      logger.error("Bolna webhook processing failed", {
        route: "POST /api/screening/voice/webhook",
        error: err instanceof Error ? err.message : String(err),
      });
      return handleApiError(err, "Voice webhook processing failed", {
        route: "POST /api/screening/voice/webhook",
      });
    }
  }),
);

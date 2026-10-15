import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/config/env";

/**
 * Recall.ai meeting-bot client. One platform API key serves every org — the bot joins via the
 * public meeting link, so no per-tenant credentials are required. Mirrors the defensive parsing
 * style of src/lib/screening/voice/bolna.ts.
 */

export type RecallBotTerminalStatus = "done" | "failed" | "no_show";

export interface DispatchRecallBotParams {
  meetingUrl: string;
  /** ISO-8601 scheduled join time; Recall holds the bot until then. */
  joinAt?: string | null;
  botName?: string;
  /** Echoed back on every webhook for correlation with the interview_recordings row. */
  metadata: Record<string, string>;
}

export interface RecallBotArtifacts {
  transcript: string;
  recording_url: string;
  duration_seconds: number;
  status: RecallBotTerminalStatus;
}

type JsonRecord = Record<string, unknown>;

function getRecallApiKey(): string {
  const apiKey = env.recallApiKey.trim();
  if (!apiKey) throw new Error("RECALL_API_KEY is not configured");
  return apiKey;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" ? (value as JsonRecord) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function readNestedString(obj: JsonRecord, paths: string[][]): string {
  for (const path of paths) {
    let cursor: unknown = obj;
    for (const segment of path) {
      cursor = asRecord(cursor)[segment];
    }
    const value = asString(cursor);
    if (value) return value;
  }
  return "";
}

/**
 * Recall status codes → our terminal buckets. Accepts either the bare status code
 * (`data.data.code`, e.g. "done") or the prefixed event name (`event`, e.g. "bot.done").
 * Only `bot.done` guarantees media is downloadable — `call_ended` explicitly does NOT
 * (docs: "wait for the bot.done event"), so it stays non-terminal here.
 */
export function normalizeRecallStatus(rawStatus: string): RecallBotTerminalStatus | "pending" {
  const status = rawStatus.toLowerCase().replace(/^bot\./, "");
  if (status === "done" || status === "analysis_done") return "done";
  if (["fatal", "error", "failed"].includes(status)) return "failed";
  if (["no_show", "bot_rejected", "bot_removed", "timeout", "did_not_join"].includes(status)) {
    return "no_show";
  }
  return "pending";
}

async function recallRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${env.recallBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${getRecallApiKey()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Recall request failed (${response.status}): ${errorBody.slice(0, 500)}`);
  }

  return (await response.json()) as T;
}

/** Max minutes the bot will record before auto-leaving — hard ceiling on per-session COGS. */
function maxRecordingSeconds(): number {
  const raw = (process.env.RECALL_MAX_RECORDING_MINUTES ?? "").trim();
  const minutes = raw ? Number(raw) : 90;
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 90) * 60;
}

/**
 * Dispatch a bot to a live meeting. Uses the platform's own meeting captions as the (free)
 * transcript source so we avoid Recall's $0.15/hr transcription surcharge — our Claude
 * summariser turns that transcript into a scorecard.
 *
 * COGS guardrails (Recall bills per recording hour): the bot leaves quickly if it's stuck in a
 * waiting room or nobody joins (no-show), and a hard in-call recording cap stops a forgotten
 * meeting from billing for hours. Tunable via RECALL_MAX_RECORDING_MINUTES.
 */
export async function dispatchRecallBot(
  params: DispatchRecallBotParams,
): Promise<{ recall_bot_id: string }> {
  const payload: JsonRecord = {
    meeting_url: params.meetingUrl,
    bot_name: params.botName?.trim() || "TigerHire Notetaker",
    metadata: params.metadata,
    recording_config: {
      transcript: {
        provider: {
          // Captions emitted by the meeting platform — no extra Recall transcription charge.
          meeting_captions: {},
        },
      },
    },
    automatic_leave: {
      // No-show / stuck-in-waiting-room: leave after 5 min instead of Recall's 20 min default.
      waiting_room_timeout: 300,
      noone_joined_timeout: 300,
      // Recording consent not granted: don't loiter for an hour.
      in_call_not_recording_timeout: 600,
      // Hard ceiling on billed recording time (forgotten/overrun meetings).
      in_call_recording_timeout: maxRecordingSeconds(),
    },
    ...(params.joinAt ? { join_at: params.joinAt } : {}),
  };

  // Trailing slash is required — Recall's API is slash-terminated and a redirect would drop
  // the POST body (docs: `POST /api/v1/bot/`).
  const response = await recallRequest<JsonRecord>("/api/v1/bot/", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const botId = readNestedString(response, [["id"], ["bot_id"], ["data", "id"]]);
  if (!botId) throw new Error("Recall bot creation response missing bot id");
  return { recall_bot_id: botId };
}

/**
 * Flatten Recall's transcript download JSON to plain text. Current schema (download_url) is an
 * array of `{ participant: { name, ... }, words: [{ text, ... }] }`; older payloads used a flat
 * `speaker` string — both are handled.
 */
function flattenTranscript(raw: unknown): string {
  if (!Array.isArray(raw)) return "";
  const lines: string[] = [];
  for (const seg of raw) {
    const record = asRecord(seg);
    const speaker =
      asString(asRecord(record.participant).name) ||
      asString(record.speaker) ||
      asString(record.participant);
    const words = record.words;
    let text = "";
    if (Array.isArray(words)) {
      text = words
        .map((w) => asString(asRecord(w).text))
        .filter(Boolean)
        .join(" ");
    } else {
      text = asString(record.text);
    }
    if (!text) continue;
    lines.push(speaker ? `${speaker}: ${text}` : text);
  }
  return lines.join("\n");
}

export async function fetchRecallBotArtifacts(botId: string): Promise<RecallBotArtifacts> {
  const bot = await recallRequest<JsonRecord>(`/api/v1/bot/${encodeURIComponent(botId)}/`, {
    method: "GET",
  });

  // Latest status code lives at the tail of status_changes, with a flat `status` fallback.
  const statusChanges = Array.isArray(bot.status_changes) ? bot.status_changes : [];
  const latestChange = asRecord(statusChanges[statusChanges.length - 1]);
  const rawStatus =
    asString(latestChange.code) || readNestedString(bot, [["status", "code"], ["status"]]);

  const recordingUrl = readNestedString(bot, [
    ["recordings", "0", "media_shortcuts", "video_mixed", "data", "download_url"],
    ["video_url"],
    ["mp4"],
    ["recording_url"],
  ]);

  // Duration: derive from the recording's started_at/completed_at (the documented fields);
  // legacy flat fields kept as fallbacks.
  const recording = asRecord(asRecord(bot.recordings)["0"]);
  const startedAt = Date.parse(asString(recording.started_at));
  const completedAt = Date.parse(asString(recording.completed_at));
  let duration =
    Number.isFinite(startedAt) && Number.isFinite(completedAt) && completedAt > startedAt
      ? (completedAt - startedAt) / 1000
      : 0;
  if (!duration) {
    duration = asNumber(
      readNestedString(bot, [
        ["recording_duration_seconds"],
        ["duration"],
        ["recordings", "0", "duration"],
      ]),
    );
  }

  // Transcript: current API exposes it as a pre-signed download URL on the recording's
  // media_shortcuts (the legacy GET /bot/{id}/transcript endpoint no longer exists).
  let transcript = "";
  const transcriptUrl = readNestedString(bot, [
    ["recordings", "0", "media_shortcuts", "transcript", "data", "download_url"],
  ]);
  if (transcriptUrl) {
    try {
      const res = await fetch(transcriptUrl, { cache: "no-store" });
      if (res.ok) transcript = flattenTranscript(await res.json());
    } catch {
      // Transcript not ready/available — caller handles empty transcript gracefully.
      transcript = "";
    }
  }

  const normalized = normalizeRecallStatus(rawStatus);
  return {
    transcript,
    recording_url: recordingUrl,
    duration_seconds: Math.max(0, Math.round(duration)),
    status: normalized === "pending" ? "done" : normalized,
  };
}

/**
 * Verify a Recall (Svix) webhook signature. Recall signs with `whsec_<base64secret>`; the signed
 * content is `${svix-id}.${svix-timestamp}.${rawBody}` and `svix-signature` is a space-delimited
 * list of `v1,<base64sig>` entries. Returns false on any malformed input.
 */
export function verifyRecallWebhookSignature(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
): boolean {
  const secretRaw = env.recallWebhookSecret.trim();
  const id = (headers.id ?? "").trim();
  const timestamp = (headers.timestamp ?? "").trim();
  const signatureHeader = (headers.signature ?? "").trim();
  if (!secretRaw || !id || !timestamp || !signatureHeader) return false;

  // Replay protection: Svix timestamps are unix seconds. Reject deliveries whose
  // timestamp is more than 5 minutes from now, so a captured payload cannot be
  // replayed indefinitely.
  const tsSeconds = Number(timestamp);
  if (!Number.isFinite(tsSeconds)) return false;
  const skewSeconds = Math.abs(Date.now() / 1000 - tsSeconds);
  if (skewSeconds > 300) return false;

  const secretKey = secretRaw.startsWith("whsec_") ? secretRaw.slice(6) : secretRaw;
  let secretBytes: Buffer;
  try {
    secretBytes = Buffer.from(secretKey, "base64");
  } catch {
    return false;
  }

  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent, "utf8").digest("base64");
  const expectedBuf = Buffer.from(expected);

  // Header may carry multiple "v1,<sig>" tokens; accept if any matches in constant time.
  for (const token of signatureHeader.split(" ")) {
    const sig = token.includes(",") ? token.split(",", 2)[1] : token;
    const candidate = Buffer.from((sig ?? "").trim());
    if (candidate.length === expectedBuf.length && timingSafeEqual(candidate, expectedBuf)) {
      return true;
    }
  }
  return false;
}

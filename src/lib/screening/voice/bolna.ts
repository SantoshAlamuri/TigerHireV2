import { createHmac, timingSafeEqual } from "node:crypto";
import { isEnabled } from "@/lib/feature-flags";
import { FEATURE_FLAG_VOICE_SCREENING_BOLNA } from "./constants";

export type BolnaCallTerminalStatus = "completed" | "failed" | "no_answer";

export interface InitiateBolnaCallParams {
  /** Org placing the call; used to evaluate the voice_screening_bolna feature flag. */
  organisation_id: string;
  candidate_phone: string;
  candidate_name: string;
  company_name: string;
  role_title: string;
  req_location?: string;
  script: {
    system_prompt: string;
    max_duration_seconds?: number;
    fallback_questions?: string[];
    version?: string;
  };
  webhook_correlation_id: string;
}

export interface BolnaCallArtifacts {
  transcript: string;
  audio_url: string;
  duration_seconds: number;
  status: BolnaCallTerminalStatus;
}

type JsonRecord = Record<string, unknown>;

const BOLNA_BASE_URL = (process.env.BOLNA_BASE_URL ?? "https://api.bolna.ai").replace(/\/$/, "");

function getBolnaApiKey(): string {
  const apiKey = (process.env.BOLNA_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("BOLNA_API_KEY is not configured");
  return apiKey;
}

function getBolnaAgentId(): string {
  const agentId = (process.env.BOLNA_AGENT_ID ?? "").trim();
  if (!agentId) throw new Error("BOLNA_AGENT_ID is not configured");
  return agentId;
}

function getBolnaFromPhoneNumber(): string | null {
  const fromPhone = (process.env.BOLNA_FROM_PHONE_NUMBER ?? "").trim();
  if (!fromPhone) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("BOLNA_FROM_PHONE_NUMBER is required in production for outbound voice calls");
    }
    return null;
  }
  if (!/^\+\d{10,15}$/.test(fromPhone)) {
    throw new Error("BOLNA_FROM_PHONE_NUMBER must be E.164 (example: +919876543210)");
  }
  return fromPhone;
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

/** Like readNestedString but accepts raw numbers too (Bolna's conversation_duration is a float). */
function readNestedNumber(obj: JsonRecord, paths: string[][]): number {
  for (const path of paths) {
    let cursor: unknown = obj;
    for (const segment of path) {
      cursor = asRecord(cursor)[segment];
    }
    const value = asNumber(cursor);
    if (value) return value;
  }
  return 0;
}

function normalizeTerminalStatus(rawStatus: string): BolnaCallTerminalStatus {
  const status = rawStatus.toLowerCase();
  if (["completed", "success", "ended", "done"].includes(status)) return "completed";
  // Bolna terminal statuses where the candidate never picked up: no-answer and busy.
  if (["no_answer", "no-answer", "noanswer", "busy", "missed", "unanswered"].includes(status)) {
    return "no_answer";
  }
  return "failed";
}

function toSafeValue(value: string | undefined, fallback: string): string {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : fallback;
}

function renderPromptTemplate(
  text: string,
  context: {
    candidate_name: string;
    company_name: string;
    role_title: string;
    req_location: string;
  },
): string {
  return text
    .replaceAll("{candidate_name}", context.candidate_name)
    .replaceAll("{company_name}", context.company_name)
    .replaceAll("{role_title}", context.role_title)
    .replaceAll("{req_location}", context.req_location);
}

async function bolnaRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${BOLNA_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getBolnaApiKey()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Bolna request failed (${response.status}): ${errorBody.slice(0, 500)}`);
  }

  return (await response.json()) as T;
}

export async function initiateBolnaCall(params: InitiateBolnaCallParams): Promise<{
  bolna_call_id: string;
}> {
  // Hard kill switch: never place an outbound Bolna call when voice screening is globally
  // disabled. Callers gate earlier for graceful UX; this is the last-line guarantee.
  if (!(await isEnabled(FEATURE_FLAG_VOICE_SCREENING_BOLNA, params.organisation_id))) {
    throw new Error("voice_screening_bolna_disabled: Bolna voice screening is turned off");
  }

  const promptContext = {
    candidate_name: toSafeValue(params.candidate_name, "Candidate"),
    company_name: toSafeValue(params.company_name, "TigerHire partner"),
    role_title: toSafeValue(params.role_title, "Role"),
    req_location: toSafeValue(params.req_location, "the role location"),
  };
  const renderedSystemPrompt = renderPromptTemplate(params.script.system_prompt, promptContext);
  const renderedFallbackQuestions = (params.script.fallback_questions ?? []).map((question) =>
    renderPromptTemplate(question, promptContext),
  );
  const fromPhoneNumber = getBolnaFromPhoneNumber();

  // Documented /call contract: agent_id + recipient_phone_number (+ optional from_phone_number).
  // `user_data` is the documented carrier for dynamic variables referenced in the agent prompt
  // and is echoed back on the completion webhook via the execution's context data.
  const payload = {
    agent_id: getBolnaAgentId(),
    recipient_phone_number: params.candidate_phone,
    ...(fromPhoneNumber ? { from_phone_number: fromPhoneNumber } : {}),
    user_data: {
      webhook_correlation_id: params.webhook_correlation_id,
      candidate_name: promptContext.candidate_name,
      company_name: promptContext.company_name,
      role_title: promptContext.role_title,
      req_location: promptContext.req_location,
      screening_system_prompt: renderedSystemPrompt,
      screening_fallback_questions: renderedFallbackQuestions,
      screening_max_duration_seconds: params.script.max_duration_seconds ?? 360,
      script_version: params.script.version ?? "1.0.0",
    },
  };

  const response = await bolnaRequest<JsonRecord>("/call", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const bolnaCallId = readNestedString(response, [
    ["execution_id"],
    ["call_id"],
    ["id"],
    ["data", "execution_id"],
    ["data", "call_id"],
    ["data", "id"],
  ]);
  if (!bolnaCallId) throw new Error("Bolna call initiation response missing call id");

  return { bolna_call_id: bolnaCallId };
}

export async function fetchBolnaCallArtifacts(bolna_call_id: string): Promise<BolnaCallArtifacts> {
  const response = await bolnaRequest<JsonRecord>(
    `/executions/${encodeURIComponent(bolna_call_id)}`,
    {
      method: "GET",
    },
  );

  const transcript = readNestedString(response, [
    ["transcript"],
    ["data", "transcript"],
    ["artifacts", "transcript"],
    ["data", "artifacts", "transcript"],
  ]);
  const audioUrl = readNestedString(response, [
    // Documented location on the execution object.
    ["telephony_data", "recording_url"],
    ["audio_url"],
    ["recording_url"],
    ["data", "audio_url"],
    ["data", "recording_url"],
    ["artifacts", "audio_url"],
    ["data", "artifacts", "audio_url"],
  ]);
  const rawStatus = readNestedString(response, [
    ["status"],
    ["call_status"],
    ["data", "status"],
    ["data", "call_status"],
  ]);
  const duration = readNestedNumber(response, [
    // Documented fields: conversation_duration (float seconds) and telephony_data.duration.
    ["conversation_duration"],
    ["telephony_data", "duration"],
    ["conversation_time"],
    ["duration_seconds"],
    ["duration"],
    ["data", "conversation_duration"],
    ["data", "conversation_time"],
    ["data", "duration_seconds"],
    ["data", "duration"],
  ]);

  return {
    transcript,
    audio_url: audioUrl,
    duration_seconds: Math.max(0, Math.round(duration)),
    status: normalizeTerminalStatus(rawStatus),
  };
}

export function verifyBolnaWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = (process.env.BOLNA_WEBHOOK_SECRET ?? "").trim();
  const received = (signature ?? "").trim();
  if (!secret || !received) return false;

  const normalized = received.startsWith("sha256=") ? received.slice(7) : received;
  const computed = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  try {
    const left = Buffer.from(normalized, "hex");
    const right = Buffer.from(computed, "hex");
    return left.length === right.length && timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

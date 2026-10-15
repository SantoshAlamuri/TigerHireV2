import { getCorrelationId } from "./correlation";

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  correlation_id?: string;
  user_id?: string;
  agent?: string;
  candidate_id?: string;
  job_id?: string;
  duration_ms?: number;
  tokens_used?: number;
  cost_inr?: number;
  error?: string;
  [key: string]: unknown;
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// National IDs (redact before PHONE_RE, whose digit run would otherwise swallow them).
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g; // US SSN
const PAN_RE = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g; // India PAN
const AADHAAR_RE = /\b\d{4}\s?\d{4}\s?\d{4}\b/g; // India Aadhaar (12 digits)
const PHONE_RE = /\+?[\d\s-()]{10,}/g;

/**
 * Keys whose values are PII regardless of format, so value-pattern matching
 * cannot reliably catch them (free-text names, salary numbers, raw CV text,
 * profile URLs/locations). Matched case-insensitively. Email/phone are NOT
 * here — their value patterns already redact them with specific tokens.
 */
const PII_KEY_DENYLIST = new Set([
  "full_name",
  "name",
  "first_name",
  "last_name",
  "cv_raw_text",
  "resume_text",
  "cover_letter",
  "linkedin_url",
  "github_url",
  "location",
  "address",
  "salary",
  "current_salary",
  "expected_salary",
  "ctc",
  "compensation",
  "dob",
  "date_of_birth",
  "aadhaar",
  "pan",
  "ssn",
  "national_id",
  "passport",
]);

function redactString(s: string): string {
  return s
    .replace(EMAIL_RE, "[email redacted]")
    .replace(SSN_RE, "[id redacted]")
    .replace(PAN_RE, "[id redacted]")
    .replace(AADHAAR_RE, "[id redacted]")
    .replace(PHONE_RE, "[phone redacted]");
}

/**
 * Recursively redact PII from any log value: strings via value patterns,
 * objects and arrays (including arrays of objects) by recursion, and any value
 * under a denylisted key wholesale. Non-PII scalars pass through unchanged.
 */
function redactValue(value: unknown, key?: string): unknown {
  if (value == null) return value;
  if (key && PII_KEY_DENYLIST.has(key.toLowerCase())) {
    return "[redacted]";
  }
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactValue(v, k);
    }
    return out;
  }
  return value;
}

function redactPii(obj: Record<string, unknown>): Record<string, unknown> {
  return redactValue(obj) as Record<string, unknown>;
}

function log(level: LogLevel, message: string, meta: Partial<LogEntry> = {}) {
  const isProd = process.env.NODE_ENV === "production";
  const sanitized = isProd ? redactPii(meta as Record<string, unknown>) : { ...meta };
  const safeMessage = isProd ? redactString(message) : message;

  const correlationId = getCorrelationId();
  if (correlationId && !sanitized.correlation_id) {
    (sanitized as Record<string, unknown>).correlation_id = correlationId;
  }

  const entry: LogEntry = {
    level,
    message: safeMessage,
    timestamp: new Date().toISOString(),
    ...sanitized,
  };

  if (isProd) {
    process.stdout.write(JSON.stringify(entry) + "\n");
  } else {
    const tag = `[${level.toUpperCase()}]`;
    const metaSuffix = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    process.stdout.write(`${tag} ${message}${metaSuffix}\n`);
  }
}

export const logger = {
  info: (message: string, meta: Partial<LogEntry> = {}) => log("info", message, meta),

  warn: (message: string, meta: Partial<LogEntry> = {}) => log("warn", message, meta),

  error: (message: string, meta: Partial<LogEntry> = {}) => log("error", message, meta),

  debug: (message: string, meta: Partial<LogEntry> = {}) => {
    if (process.env.NODE_ENV !== "production") {
      log("debug", message, meta);
    }
  },

  agent: (agentName: string, meta: Partial<LogEntry> = {}) =>
    log("info", `agent:${agentName}`, { agent: agentName, ...meta }),
};

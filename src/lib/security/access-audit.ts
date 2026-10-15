import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

export type AccessAuditAction = "unlock" | "download_cv" | "view_pii";

/**
 * High-sensitivity actions whose audit-write failures are escalated to
 * error-level logs (alertable) and, for callers that opt in via
 * { failClosed: true }, cause the operation to throw so PII access can be
 * denied. See docs/SecurityAudits/pii-hardening-review.md (PII-005) for the
 * documented fail policy.
 */
const HIGH_SENSITIVITY_ACTIONS: ReadonlySet<AccessAuditAction> = new Set([
  "view_pii",
  "download_cv",
  "unlock",
]);

const MAX_AUDIT_WRITE_ATTEMPTS = 3;
const AUDIT_RETRY_BASE_DELAY_MS = 50;

interface AccessAuditEvent {
  userId: string;
  candidateId: string;
  action: AccessAuditAction;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AuditWriteOptions {
  /**
   * When true and the audit write ultimately fails, throw AuditWriteError so
   * the caller can deny the underlying PII access (fail-closed). Default false
   * (fail-open): callers keep serving but the failure is logged/alerted.
   */
  failClosed?: boolean;
}

/** Thrown only when a caller opted into failClosed and the write failed. */
export class AuditWriteError extends Error {
  constructor(
    public readonly action: AccessAuditAction,
    cause?: string,
  ) {
    super(`Access audit write failed for action "${action}"${cause ? `: ${cause}` : ""}`);
    this.name = "AuditWriteError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Insert audit rows with bounded retry. Detects both thrown errors AND the
 * Supabase `{ error }` result (previously swallowed). Returns the final
 * outcome rather than silently succeeding.
 */
async function insertAuditRows(
  rows: Record<string, unknown>[],
): Promise<{ ok: boolean; error?: string }> {
  let lastError: string | undefined;
  for (let attempt = 1; attempt <= MAX_AUDIT_WRITE_ATTEMPTS; attempt++) {
    try {
      const admin = createSupabaseAdmin();
      const { error } = await admin.from("access_audit_log").insert(rows);
      if (!error) return { ok: true };
      lastError = error.message ?? String(error);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (attempt < MAX_AUDIT_WRITE_ATTEMPTS) {
      await sleep(AUDIT_RETRY_BASE_DELAY_MS * attempt);
    }
  }
  return { ok: false, error: lastError };
}

function reportFailure(
  action: AccessAuditAction,
  meta: Record<string, unknown>,
  error?: string,
): void {
  const payload = { ...meta, action, error: error ?? "unknown" };
  if (HIGH_SENSITIVITY_ACTIONS.has(action)) {
    logger.error("Access audit write failed after retries (high-sensitivity)", payload);
  } else {
    logger.warn("Access audit write failed after retries", payload);
  }
}

/**
 * Record a single PII-access audit event. Returns true on success, false on
 * failure (fail-open). Pass { failClosed: true } to throw AuditWriteError on
 * failure so the caller can deny access.
 */
export async function writeAccessAuditEvent(
  event: AccessAuditEvent,
  options: AuditWriteOptions = {},
): Promise<boolean> {
  const { ok, error } = await insertAuditRows([
    {
      user_id: event.userId,
      candidate_id: event.candidateId,
      action: event.action,
      ip_address: event.ipAddress ?? null,
      user_agent: event.userAgent ?? null,
      metadata: event.metadata ?? {},
    },
  ]);

  if (ok) return true;

  reportFailure(event.action, { candidate_id: event.candidateId, user_id: event.userId }, error);
  if (options.failClosed) throw new AuditWriteError(event.action, error);
  return false;
}

/**
 * Record a batch of PII-access audit events (one row per candidate). Returns
 * true on success, false on failure (fail-open). Pass { failClosed: true } to
 * throw AuditWriteError on failure.
 */
export async function writeAccessAuditBatch(
  userId: string,
  candidateIds: string[],
  action: AccessAuditAction,
  metadata: Record<string, unknown>,
  ipAddress?: string | null,
  userAgent?: string | null,
  options: AuditWriteOptions = {},
): Promise<boolean> {
  const uniqueCandidateIds = [...new Set(candidateIds.filter(Boolean))];
  if (uniqueCandidateIds.length === 0) return true;

  const { ok, error } = await insertAuditRows(
    uniqueCandidateIds.map((candidateId) => ({
      user_id: userId,
      candidate_id: candidateId,
      action,
      ip_address: ipAddress ?? null,
      user_agent: userAgent ?? null,
      metadata,
    })),
  );

  if (ok) return true;

  reportFailure(action, { candidate_count: uniqueCandidateIds.length, user_id: userId }, error);
  if (options.failClosed) throw new AuditWriteError(action, error);
  return false;
}

import { logger } from "@/lib/observability/logger";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeIndianPhone } from "./normalize-phone";

export type WhatsAppSessionState =
  | "new"
  | "awaiting_consent"
  | "consent_given"
  | "opted_out"
  | "cv_requested"
  | "cv_received"
  | "scored"
  | "vouch_q1"
  | "vouch_q2"
  | "vouch_q3"
  | "vouch_q4"
  | "vouch_q5"
  | "slot_selection"
  | "referral_ready"
  | "referral_collecting"
  | "referral_phone_requested"
  | "referral_complete"
  /** Rules-routed marketing / sales / waitlist; no CV consent until user says APPLY or similar */
  | "business_inquiry"
  | "complete"
  /** Lane B: WhatsApp Q&A for preferences after cold CV drop */
  | "collecting_preferences"
  /** Guided funnel: pick role family from currently open jobs */
  | "role_family_selection"
  /** Guided funnel: pick specific role before JD scoring */
  | "role_job_selection"
  /** Guided funnel: collecting canonical per-job screening question YES/NO answers */
  | "screening_questions"
  /** Q&A done; immediate match running or just finished */
  | "preferences_complete"
  /** Subscribed for new-role alerts (see alerts_expires_at) */
  | "active_alerts"
  /** Subscription lapsed (e.g. 6 months) */
  | "expired";

export interface WhatsAppSession {
  id: string;
  phone: string;
  session_state: WhatsAppSessionState;
  context: Record<string, unknown>;
  last_message_at: string;
  created_at: string;
  last_candidate_message_at?: string | null;
  qa_step?: number;
  alerts_expires_at?: string | null;
  alert_last_sent_at?: string | null;
  version: number;
}

export type SessionUpdateExtras = {
  qa_step?: number;
  alerts_expires_at?: string | null;
  alert_last_sent_at?: string | null;
};

/**
 * Thrown when an `updateSession` UPDATE matches zero rows because the
 * `expectedVersion` did not equal the row's current `version`. Indicates a
 * concurrent writer raced this isolate. Callers should re-read the session
 * and decide whether to retry against the new state.
 */
export class SessionConflictError extends Error {
  readonly phone: string;
  readonly expectedVersion: number;

  constructor(phone: string, expectedVersion: number) {
    super(
      `WhatsApp session optimistic concurrency conflict for phone=${phone} expectedVersion=${expectedVersion}`,
    );
    this.name = "SessionConflictError";
    this.phone = phone;
    this.expectedVersion = expectedVersion;
  }
}

function sessionPhoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const normalized = normalizeIndianPhone(digits || phone);
  return normalized || digits;
}

export async function getOrCreateSession(phone: string): Promise<WhatsAppSession> {
  const supabase = createSupabaseAdmin();
  const normalized = sessionPhoneKey(phone);

  const { data: existing } = await supabase
    .from("whatsapp_sessions")
    .select("*")
    .eq("phone", normalized)
    .maybeSingle();

  if (existing) {
    const now = new Date().toISOString();
    const { error: touchErr } = await supabase
      .from("whatsapp_sessions")
      .update({ last_message_at: now })
      .eq("id", existing.id);
    if (touchErr) {
      logger.error("WhatsApp session touch last_message_at failed", {
        id: existing.id,
        message: touchErr.message,
      });
    }
    return { ...(existing as WhatsAppSession), last_message_at: now };
  }

  // Insert-if-absent atomically. `ignoreDuplicates` issues INSERT ... ON CONFLICT
  // (phone) DO NOTHING, so two truly-simultaneous first-messages don't collide on
  // the UNIQUE(phone) constraint — the loser gets no row back (rather than a thrown
  // unique-violation that previously dropped the message, since the inbound's
  // idempotency key was already claimed and Meta is always 200'd). DO NOTHING also
  // means we never clobber an existing row's state/context on the race.
  const { data: created, error } = await supabase
    .from("whatsapp_sessions")
    .upsert(
      {
        phone: normalized,
        session_state: "new",
        context: {},
      },
      { onConflict: "phone", ignoreDuplicates: true },
    )
    .select()
    .maybeSingle();

  if (error) {
    logger.error("WhatsApp session insert failed", { error: String(error) });
    throw new Error("Failed to create WhatsApp session");
  }

  if (created) {
    return created as WhatsAppSession;
  }

  // Lost the insert race: a concurrent isolate created the row first. Re-read it
  // rather than throwing — the caller's read-modify-write (withSessionCAS) will
  // reconcile via optimistic version on the subsequent update.
  const { data: raced, error: reselectErr } = await supabase
    .from("whatsapp_sessions")
    .select("*")
    .eq("phone", normalized)
    .maybeSingle();

  if (reselectErr || !raced) {
    logger.error("WhatsApp session insert race re-select failed", {
      error: reselectErr ? String(reselectErr) : "no row after conflict",
    });
    throw new Error("Failed to create WhatsApp session");
  }

  return raced as WhatsAppSession;
}

/**
 * Optimistic-concurrency UPDATE. The UPDATE only matches when `version` still
 * equals `expectedVersion`; on match it sets `version = version + 1` so the
 * next caller observing this state must pass the new value.
 *
 * Throws `SessionConflictError` if zero rows matched — i.e. another isolate
 * wrote between this caller's read and write. Use {@link withSessionCAS} for
 * the common read-modify-write loop with bounded retries.
 */
export async function updateSession(
  phone: string,
  sessionState: WhatsAppSessionState,
  context: Record<string, unknown>,
  expectedVersion: number,
  extras?: SessionUpdateExtras,
): Promise<void> {
  const supabase = createSupabaseAdmin();
  const normalized = sessionPhoneKey(phone);

  const row: Record<string, unknown> = {
    session_state: sessionState,
    context,
    last_message_at: new Date().toISOString(),
    version: expectedVersion + 1,
  };
  if (extras?.qa_step !== undefined) row.qa_step = extras.qa_step;
  if (extras?.alerts_expires_at !== undefined) row.alerts_expires_at = extras.alerts_expires_at;
  if (extras?.alert_last_sent_at !== undefined) row.alert_last_sent_at = extras.alert_last_sent_at;

  const { data, error } = await supabase
    .from("whatsapp_sessions")
    .update(row)
    .eq("phone", normalized)
    .eq("version", expectedVersion)
    .select("id");

  if (error) {
    logger.error("WhatsApp session update failed", { error: String(error) });
    throw new Error("Failed to update WhatsApp session");
  }

  if (!data || data.length === 0) {
    throw new SessionConflictError(normalized, expectedVersion);
  }
}

export type SessionCASOutcome = {
  state: WhatsAppSessionState;
  context: Record<string, unknown>;
  extras?: SessionUpdateExtras;
};

const SESSION_CAS_MAX_ATTEMPTS = 3;

/**
 * Read-modify-write helper that retries on {@link SessionConflictError}.
 *
 * `mutate` receives the freshly-read session and returns the next state,
 * context, and optional extras to persist. If the underlying UPDATE loses the
 * race, the helper re-reads and retries — up to 3 attempts total — so callers
 * do not have to plumb `expectedVersion` themselves.
 *
 * Returns `null` if `mutate` returns `null` (i.e. the caller decided no write
 * is needed after seeing fresh state). Throws `SessionConflictError` if all
 * retries are exhausted.
 */
export async function withSessionCAS(
  phone: string,
  mutate: (
    session: WhatsAppSession,
  ) => Promise<SessionCASOutcome | null> | SessionCASOutcome | null,
): Promise<WhatsAppSession | null> {
  let lastConflict: SessionConflictError | null = null;
  for (let attempt = 0; attempt < SESSION_CAS_MAX_ATTEMPTS; attempt += 1) {
    const session = await getOrCreateSession(phone);
    const outcome = await mutate(session);
    if (!outcome) return null;
    try {
      await updateSession(phone, outcome.state, outcome.context, session.version, outcome.extras);
      return { ...session, session_state: outcome.state, context: outcome.context };
    } catch (err) {
      if (err instanceof SessionConflictError) {
        lastConflict = err;
        continue;
      }
      throw err;
    }
  }
  throw lastConflict ?? new SessionConflictError(sessionPhoneKey(phone), -1);
}

/**
 * Best-effort read of the org stamped on a WhatsApp session for a phone.
 *
 * Backed by the optional `whatsapp_sessions.organisation_id` column. If the
 * column does not exist yet (migration not applied), this returns null rather
 * than throwing, so callers can degrade gracefully. Never throws.
 */
export async function getSessionOrganisationId(phone: string): Promise<string | null> {
  try {
    const supabase = createSupabaseAdmin();
    const normalized = sessionPhoneKey(phone);

    const { data, error } = await supabase
      .from("whatsapp_sessions")
      .select("organisation_id")
      .eq("phone", normalized)
      .maybeSingle<{ organisation_id: string | null }>();

    if (error) {
      logger.warn("WhatsApp session getSessionOrganisationId failed", { error: error.message });
      return null;
    }
    return data?.organisation_id ?? null;
  } catch (error) {
    logger.warn("WhatsApp session getSessionOrganisationId threw", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Best-effort stamp of the resolved org onto a WhatsApp session for a phone.
 *
 * Backed by the optional `whatsapp_sessions.organisation_id` column. If the
 * column does not exist yet (migration not applied), this no-ops gracefully.
 * Never throws.
 */
export async function setSessionOrganisationId(phone: string, orgId: string): Promise<void> {
  try {
    const supabase = createSupabaseAdmin();
    const normalized = sessionPhoneKey(phone);

    const { error } = await supabase
      .from("whatsapp_sessions")
      .update({ organisation_id: orgId })
      .eq("phone", normalized);

    if (error) {
      logger.warn("WhatsApp session setSessionOrganisationId failed", { error: error.message });
    }
  } catch (error) {
    logger.warn("WhatsApp session setSessionOrganisationId threw", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

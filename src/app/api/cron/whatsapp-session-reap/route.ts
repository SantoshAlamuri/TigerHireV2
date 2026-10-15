import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { validateCronSecret } from "@/lib/security/cron-auth";
import { logger } from "@/lib/observability/logger";

/**
 * Stale-session reaper.
 *
 * Closes whatsapp_sessions that haven't been touched for STALE_SESSION_DAYS
 * and are stuck in a non-terminal state. Without this reaper, a candidate
 * whose CV ingest threw (Claude 5xx, malformed PDF) stays in `cv_requested`
 * forever — every future "Hi" from them is matched against that state and
 * gets asked to send a PDF again, indefinitely.
 *
 * Run daily. Auth: CRON_SECRET or CRON_SECRET_HASH (SHA-256 hex) in Bearer.
 */
const STALE_SESSION_DAYS = 14;

// Terminal / "alive" states that should NOT be reaped:
// - opted_out / complete / expired: already terminal
// - active_alerts: user is subscribed to job alerts and reaper would unsubscribe them
const TERMINAL_OR_ALIVE_STATES = ["opted_out", "complete", "expired", "active_alerts"] as const;

export async function POST(request: NextRequest) {
  if (!(await validateCronSecret(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - STALE_SESSION_DAYS);
  const cutoffIso = cutoff.toISOString();

  // Two-step (select then update) so we can log how many were reaped and
  // surface the previous states for ops. Capped to BATCH_SIZE so a backlog
  // doesn't time out the cron invocation; the next run picks up the rest.
  const BATCH_SIZE = 500;
  const { data: stale, error: selErr } = await supabase
    .from("whatsapp_sessions")
    .select("id, session_state")
    .lt("last_message_at", cutoffIso)
    .not("session_state", "in", `(${TERMINAL_OR_ALIVE_STATES.map((s) => `"${s}"`).join(",")})`)
    .limit(BATCH_SIZE);

  if (selErr) {
    logger.error("whatsapp_session_reap_select_failed", { error: selErr.message });
    return NextResponse.json({ error: "Reap failed" }, { status: 500 });
  }

  if (!stale?.length) {
    return NextResponse.json({ reaped: 0 });
  }

  const ids = (stale as { id: string; session_state: string }[]).map((r) => r.id);
  const stateCounts = (stale as { id: string; session_state: string }[]).reduce<
    Record<string, number>
  >((acc, r) => {
    acc[r.session_state] = (acc[r.session_state] ?? 0) + 1;
    return acc;
  }, {});

  const { error: updErr } = await supabase
    .from("whatsapp_sessions")
    .update({ session_state: "expired", last_message_at: new Date().toISOString() })
    .in("id", ids);

  if (updErr) {
    logger.error("whatsapp_session_reap_update_failed", { error: updErr.message });
    return NextResponse.json({ error: "Reap failed" }, { status: 500 });
  }

  logger.info("whatsapp_session_reaped", {
    reaped: ids.length,
    by_previous_state: stateCounts,
    cutoff: cutoffIso,
  });

  return NextResponse.json({ reaped: ids.length, by_previous_state: stateCounts });
}

export { POST as GET };

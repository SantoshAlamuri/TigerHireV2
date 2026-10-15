import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { validateCronSecret } from "@/lib/security/cron-auth";
import { logger } from "@/lib/observability/logger";

/**
 * Nightly reaper for idempotency_keys.
 *
 * withIdempotency persists cached responses for 24h. Without this reaper the
 * table grows unbounded — the TTL is enforced on read but expired rows linger.
 * Run daily. Auth: CRON_SECRET or CRON_SECRET_HASH (SHA-256 hex) in Bearer.
 */
const REAP_BATCH_SIZE = 1000;
const REAP_AGE_MS = 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  if (!(await validateCronSecret(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();
  const cutoffIso = new Date(Date.now() - REAP_AGE_MS).toISOString();

  // Two-step (select ids, then delete) so a single batch is bounded even on
  // backends that don't honor .limit() on DELETE. Next run picks up the rest.
  const { data: stale, error: selErr } = await supabase
    .from("idempotency_keys")
    .select("key_hash, endpoint")
    .lt("created_at", cutoffIso)
    .limit(REAP_BATCH_SIZE);

  if (selErr) {
    logger.error("idempotency_reap_select_failed", { error: selErr.message });
    return NextResponse.json({ error: "Reap failed" }, { status: 500 });
  }

  if (!stale?.length) {
    return NextResponse.json({ reaped: 0 });
  }

  const { error: delErr } = await supabase
    .from("idempotency_keys")
    .delete()
    .lt("created_at", cutoffIso)
    .in(
      "key_hash",
      (stale as { key_hash: string; endpoint: string }[]).map((r) => r.key_hash),
    );

  if (delErr) {
    logger.error("idempotency_reap_delete_failed", { error: delErr.message });
    return NextResponse.json({ error: "Reap failed" }, { status: 500 });
  }

  logger.info("idempotency_reaped", { reaped: stale.length, cutoff: cutoffIso });

  return NextResponse.json({ reaped: stale.length });
}

export { POST as GET };

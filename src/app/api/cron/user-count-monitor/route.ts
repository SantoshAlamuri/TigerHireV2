import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { validateCronSecret } from "@/lib/security/cron-auth";
import { logger } from "@/lib/observability/logger";

/**
 * POST /api/cron/user-count-monitor
 * Runs daily. Logs the current auth user count and alerts if it drops unexpectedly.
 * Stores the last known count in a simple DB row so we can compare across runs.
 * Auth: CRON_SECRET or CRON_SECRET_HASH in Bearer header.
 */

const ALERT_DROP_THRESHOLD = 0.1; // alert if user count drops by more than 10%

export async function POST(request: NextRequest) {
  if (!(await validateCronSecret(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdmin();

  // Count current profiles (proxy for auth user count, avoids listUsers pagination)
  const { count: profileCount, error: countErr } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true });

  // If the count query failed, ABORT. Writing a 0 snapshot here would both fire a
  // false total-loss alert and poison the baseline so every subsequent real drop
  // is silent. Alert on the monitor's own failure instead.
  if (countErr || profileCount === null) {
    logger.error("user-count-monitor: profile count query failed — skipping snapshot", {
      error: countErr ? String(countErr.message ?? countErr) : "null count",
    });
    return NextResponse.json({ error: "profile count query failed" }, { status: 500 });
  }

  const { data: lastCheck } = await admin
    .from("user_count_snapshots")
    .select("user_count, checked_at")
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const currentCount = profileCount;
  const previousCount = lastCheck?.user_count ?? 0;
  const drop = previousCount > 0 ? (previousCount - currentCount) / previousCount : 0;

  // Store current snapshot
  await admin.from("user_count_snapshots").insert({
    user_count: currentCount,
    checked_at: new Date().toISOString(),
  });

  // Keep only last 90 days of snapshots
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  await admin.from("user_count_snapshots").delete().lt("checked_at", cutoff.toISOString());

  if (drop > ALERT_DROP_THRESHOLD && previousCount > 0) {
    const message = `USER COUNT ALERT: dropped from ${previousCount} to ${currentCount} (${(drop * 100).toFixed(1)}% decrease)`;
    logger.error(message, {
      previous_count: previousCount,
      current_count: currentCount,
      drop_percentage: Math.round(drop * 100),
    });

    return NextResponse.json({
      alert: true,
      message,
      previousCount,
      currentCount,
      dropPercentage: Math.round(drop * 100),
    });
  }

  logger.info("User count monitor: healthy", {
    current_count: currentCount,
    previous_count: previousCount,
  });

  return NextResponse.json({
    alert: false,
    currentCount,
    previousCount,
  });
}

export { POST as GET };

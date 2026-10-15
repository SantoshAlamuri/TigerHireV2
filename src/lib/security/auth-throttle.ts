import { createSupabaseAdmin } from "@/lib/supabase/admin";

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MINUTES = 15;
const LOGIN_LOCK_MINUTES = 30;
const RESET_COOLDOWN_SECONDS = 5 * 60;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function getLoginLockStatus(email: string): Promise<{
  locked: boolean;
  lockedUntil: string | null;
}> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase.rpc("get_auth_lock_status", {
    p_email: normalizeEmail(email),
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  return {
    locked: Boolean(row?.locked),
    lockedUntil: typeof row?.locked_until === "string" ? row.locked_until : null,
  };
}

export async function recordLoginFailure(email: string): Promise<{
  locked: boolean;
  remainingAttempts: number;
  lockedUntil: string | null;
}> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase.rpc("record_login_failure", {
    p_email: normalizeEmail(email),
    p_max_attempts: LOGIN_MAX_ATTEMPTS,
    p_window_minutes: LOGIN_WINDOW_MINUTES,
    p_lock_minutes: LOGIN_LOCK_MINUTES,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  return {
    locked: Boolean(row?.locked),
    remainingAttempts:
      typeof row?.remaining_attempts === "number" && Number.isFinite(row.remaining_attempts)
        ? row.remaining_attempts
        : 0,
    lockedUntil: typeof row?.locked_until === "string" ? row.locked_until : null,
  };
}

export async function clearLoginFailures(email: string): Promise<void> {
  const supabase = createSupabaseAdmin();
  const { error } = await supabase.rpc("clear_login_failures", {
    p_email: normalizeEmail(email),
  });
  if (error) throw error;
}

export async function reservePasswordResetCooldown(email: string): Promise<{
  allowed: boolean;
  retryAfterSeconds: number;
}> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase.rpc("reserve_password_reset_cooldown", {
    p_email: normalizeEmail(email),
    p_cooldown_seconds: RESET_COOLDOWN_SECONDS,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  return {
    allowed: Boolean(row?.allowed),
    retryAfterSeconds:
      typeof row?.retry_after_seconds === "number" && Number.isFinite(row.retry_after_seconds)
        ? row.retry_after_seconds
        : 0,
  };
}

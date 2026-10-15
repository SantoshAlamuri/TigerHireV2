import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { customAlphabet } from "nanoid";

const referralToken = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  10,
);

const DEFAULT_REFERRAL_LINK_TTL_DAYS = 30;

/** Parsed once per call site; override with REFERRAL_LINK_TTL_DAYS (positive integer). */
export function getReferralLinkTtlDays(): number {
  const raw = process.env.REFERRAL_LINK_TTL_DAYS;
  if (raw == null || String(raw).trim() === "") return DEFAULT_REFERRAL_LINK_TTL_DAYS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_REFERRAL_LINK_TTL_DAYS;
  return n;
}

/** Next expiry instant for a new or renewed link (now + configured TTL days). */
export function expiresAtIsoForNewOrRenewedLink(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + getReferralLinkTtlDays());
  return d.toISOString();
}

export function publicAppOrigin(request: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3000";
  const proto =
    request.headers.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const requestOrigin = `${proto}://${host}`;

  if (env) {
    // In local development, prefer the active request origin so protocol/port always match.
    if (process.env.NODE_ENV === "development" && host.includes("localhost")) {
      return requestOrigin;
    }
    return env;
  }
  return requestOrigin;
}

export type EnsureReferralTokenResult = {
  token: string | null;
  /** True when a row already existed for (referrer, job); no new row was inserted. */
  alreadyExisted: boolean;
  /** ISO timestamp; null when legacy row has no expiry. */
  expiresAt: string | null;
};

/**
 * Returns referral_links.token for (referrer, job), inserting a row only when none exists.
 * New rows get expires_at = now + REFERRAL_LINK_TTL_DAYS (default 30).
 */
export async function ensureReferralToken(
  supabase: SupabaseClient,
  referrerId: string,
  jobId: string,
): Promise<EnsureReferralTokenResult> {
  const { data: existing } = await supabase
    .from("referral_links")
    .select("token, expires_at")
    .eq("referrer_id", referrerId)
    .eq("job_id", jobId)
    .maybeSingle();

  if (existing?.token) {
    const exp = existing.expires_at as string | null | undefined;
    return {
      token: existing.token as string,
      alreadyExisted: true,
      expiresAt: exp ?? null,
    };
  }

  const expiresAt = expiresAtIsoForNewOrRenewedLink();

  for (let attempt = 0; attempt < 5; attempt++) {
    const token = referralToken();
    const { data: inserted, error } = await supabase
      .from("referral_links")
      .insert({
        token,
        referrer_id: referrerId,
        job_id: jobId,
        expires_at: expiresAt,
      })
      .select("token, expires_at")
      .maybeSingle();

    if (!error && inserted?.token) {
      const exp = inserted.expires_at as string | null | undefined;
      return {
        token: inserted.token as string,
        alreadyExisted: false,
        expiresAt: exp ?? expiresAt,
      };
    }

    if (error?.code === "23505") {
      const { data: again } = await supabase
        .from("referral_links")
        .select("token, expires_at")
        .eq("referrer_id", referrerId)
        .eq("job_id", jobId)
        .maybeSingle();
      if (again?.token) {
        const exp = again.expires_at as string | null | undefined;
        return {
          token: again.token as string,
          alreadyExisted: true,
          expiresAt: exp ?? null,
        };
      }
      continue;
    }
    return { token: null, alreadyExisted: false, expiresAt: null };
  }
  return { token: null, alreadyExisted: false, expiresAt: null };
}

export type RefreshReferralTokenOutcome =
  | { ok: true; token: string; expiresAt: string | null }
  | { ok: false; reason: "job_not_open" | "no_link" };

/**
 * Extends `expires_at` for an existing (referrer, job) link; token and URL stay the same.
 * Only allowed when the job is still open. If no link row exists, returns `no_link` (caller may mint).
 */
export async function refreshReferralToken(
  supabase: SupabaseClient,
  referrerId: string,
  jobId: string,
): Promise<RefreshReferralTokenOutcome> {
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, status")
    .eq("id", jobId)
    .maybeSingle();

  if (jobErr || !job) {
    return { ok: false, reason: "no_link" };
  }
  if (String((job as { status?: string }).status ?? "").toLowerCase() !== "open") {
    return { ok: false, reason: "job_not_open" };
  }

  const nextExpires = expiresAtIsoForNewOrRenewedLink();

  const { data, error } = await supabase
    .from("referral_links")
    .update({ expires_at: nextExpires })
    .eq("referrer_id", referrerId)
    .eq("job_id", jobId)
    .select("token, expires_at")
    .maybeSingle();

  if (error || !data?.token) {
    return { ok: false, reason: "no_link" };
  }

  const exp = data.expires_at as string | null | undefined;
  return {
    ok: true,
    token: data.token as string,
    expiresAt: exp ?? nextExpires,
  };
}

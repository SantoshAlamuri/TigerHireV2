import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeReferrerWhatsapp } from "@/lib/referrers/normalize-whatsapp";
import { env } from "@/lib/config/env";
import { sendTemplateMessage, sendWhatsAppMessage } from "@/lib/services/whatsapp";

/**
 * Meta Cloud API `to` must be full international digits (no +). Some surfaces (dashboard setup,
 * candidate profile) collect a single field and users often omit the country code.
 * When `WHATSAPP_OTP_DEFAULT_COUNTRY_CODE` is set (e.g. `91`) and we have exactly 10 digits that
 * do not already start with that code, prefix it. DB rows still use `norm` from {@link normalizeReferrerWhatsapp}.
 */
export function graphRecipientDigitsForReferrerOtp(normDigits: string): string {
  const d = normDigits.replace(/\D/g, "");
  const cc = env.whatsappOtpDefaultCountryCode;
  if (!cc || d.length !== 10) return d;
  if (d.startsWith(cc)) return d;
  return `${cc}${d}`;
}

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_TEMPLATE_NAME = "th_referrer_otp";
const OTP_TEMPLATE_LANGUAGES = ["en_US", "en"] as const;

/**
 * Max wrong verify attempts per OTP before it is auto-invalidated.
 * Drops 6-digit brute-force success to ~5/10^6 per session.
 */
const OTP_MAX_ATTEMPTS = 5;

export interface SendReferrerOtpResult {
  delivered: boolean;
  code: string;
  error?: string;
}

async function sendOtpTemplate(phoneNumber: string, code: string) {
  let firstError: string | undefined;

  for (const languageCode of OTP_TEMPLATE_LANGUAGES) {
    // The approved WABA template is an AUTHENTICATION template in en_US whose
    // copy-code button is exposed by Meta as a dynamic URL button.
    const result = await sendTemplateMessage({
      phoneNumber,
      templateName: OTP_TEMPLATE_NAME,
      languageCode,
      bodyParams: [code],
      buttonParams: [code],
      buttonSubType: "url",
    });

    if (result.success) {
      return result;
    }

    firstError ??= result.error;

    const translationMissing = result.error?.includes("does not exist in the translation");
    if (!translationMissing) {
      return result;
    }
  }

  return { success: false, error: firstError ?? "WhatsApp template send failed" };
}

/**
 * Inserts OTP and sends it via WhatsApp template `th_referrer_otp` ({{1}} = 6-digit code).
 * Throws on validation or insert failure.
 */
export async function sendReferrerOtp(
  supabase: SupabaseClient,
  whatsappNumber: string,
): Promise<SendReferrerOtpResult> {
  const raw = whatsappNumber.trim();
  const norm = normalizeReferrerWhatsapp(raw);
  if (norm.length < 8) {
    throw new Error("Invalid WhatsApp number");
  }

  // crypto.randomInt, not Math.random: V8's PRNG state is recoverable from
  // observed outputs, and this generator also backs the public demo gate.
  const code = crypto.randomInt(100000, 1000000).toString();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  const { error: insErr } = await supabase.from("referrer_otp").insert({
    whatsapp_number: norm,
    otp_code: code,
    expires_at: expiresAt,
  });

  if (insErr) {
    throw new Error(insErr.message);
  }

  const graphTo = graphRecipientDigitsForReferrerOtp(norm);
  const sendResult = await sendOtpTemplate(graphTo, code);
  if (sendResult.success) {
    return { delivered: true, code };
  }

  const fallback = `Your TigerHire verification code is ${code}. It expires in 10 minutes.`;
  const textResult = await sendWhatsAppMessage(graphTo, fallback);
  if (textResult.success) {
    return { delivered: true, code };
  }

  return {
    delivered: false,
    code,
    error: sendResult.error ?? textResult.error ?? "WhatsApp send failed",
  };
}

/**
 * Marks a matching OTP row as used. Does not update `referrers` (for candidate flows reusing `referrer_otp`).
 * Returns false if no matching unused, unexpired row. Throws on database errors.
 */
export async function consumeReferrerOtp(
  supabase: SupabaseClient,
  whatsappNumber: string,
  code: string,
): Promise<boolean> {
  const norm = normalizeReferrerWhatsapp(whatsappNumber.trim());
  const codeTrim = code.trim();
  if (norm.length < 8 || codeTrim.length < 6) return false;

  const nowIso = new Date().toISOString();

  // Find the most recent unused, unexpired OTP for this phone whose attempt cap
  // has not been exceeded. We do not filter by `otp_code` here so we can detect
  // wrong-code attempts and increment `attempt_count` — that is what kills brute
  // force. If `otp_code` matched in the query, every wrong guess would silently
  // return null and leave the OTP usable for unlimited further attempts.
  const { data: row, error: selErr } = await supabase
    .from("referrer_otp")
    .select("id, otp_code, attempt_count")
    .eq("whatsapp_number", norm)
    .gt("expires_at", nowIso)
    .is("used_at", null)
    .lt("attempt_count", OTP_MAX_ATTEMPTS)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selErr) {
    throw new Error(selErr.message);
  }
  if (!row?.id) {
    return false;
  }

  if ((row.otp_code as string) !== codeTrim) {
    // Wrong code: bump attempt_count atomically. If this attempt pushes it to
    // the cap, also mark used_at so the row can never succeed again.
    const nextCount = ((row.attempt_count as number | null) ?? 0) + 1;
    const reachedCap = nextCount >= OTP_MAX_ATTEMPTS;
    const { error: bumpErr } = await supabase
      .from("referrer_otp")
      .update({
        attempt_count: nextCount,
        ...(reachedCap ? { used_at: nowIso } : {}),
      })
      .eq("id", row.id as string)
      .lt("attempt_count", OTP_MAX_ATTEMPTS);
    if (bumpErr) {
      throw new Error(bumpErr.message);
    }
    return false;
  }

  const { error: useErr } = await supabase
    .from("referrer_otp")
    .update({ used_at: nowIso })
    .eq("id", row.id as string)
    .is("used_at", null);

  if (useErr) {
    throw new Error(useErr.message);
  }

  return true;
}

/**
 * Validates OTP, marks it used, sets referrer WhatsApp verified + active.
 * Returns false if no matching unused, unexpired row. Throws on database errors.
 */
export async function verifyReferrerOtp(
  supabase: SupabaseClient,
  whatsappNumber: string,
  code: string,
): Promise<boolean> {
  const norm = normalizeReferrerWhatsapp(whatsappNumber.trim());
  const codeTrim = code.trim();
  if (norm.length < 8 || codeTrim.length < 6) return false;

  const ok = await consumeReferrerOtp(supabase, whatsappNumber, code);
  if (!ok) return false;

  const { error: refErr } = await supabase
    .from("referrers")
    .update({ whatsapp_verified: true, status: "active" })
    .eq("whatsapp_number", norm);

  if (refErr) {
    throw new Error(refErr.message);
  }

  return true;
}

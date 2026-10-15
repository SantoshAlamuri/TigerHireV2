import { normalizeIndianPhone } from "@/lib/whatsapp/normalize-phone";

/**
 * Canonical digits-only form for `referrers.whatsapp_number` and OTP lookup.
 * Prefer `91` + 10-digit Indian mobile when the input is recognizable.
 */
export function normalizeReferrerWhatsapp(number: string): string {
  const trimmed = number.trim();
  if (!trimmed) return "";
  const normalized = normalizeIndianPhone(trimmed);
  if (/^91[6-9]\d{9}$/.test(normalized)) return normalized;
  return trimmed
    .replace(/^\+/, "")
    .replace(/[\s\-().]/g, "")
    .replace(/\D/g, "");
}

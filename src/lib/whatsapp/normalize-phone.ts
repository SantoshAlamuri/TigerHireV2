import { logger } from "@/lib/observability/logger";

/**
 * Canonical Indian WhatsApp digits: `91` + 10-digit mobile (no `+` prefix).
 * Use at every entry point (sessions, referrals, outbound sends, lookups).
 */
export function normalizeIndianPhone(raw: string): string {
  const digits = raw.replace(/[\s\-().+]/g, "");

  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return `91${digits}`;
  }

  if (digits.length === 12 && digits.startsWith("91") && /^91[6-9]\d{9}$/.test(digits)) {
    return digits;
  }

  if (digits.length === 13 && digits.startsWith("091")) {
    const trimmed = digits.slice(1);
    if (/^91[6-9]\d{9}$/.test(trimmed)) return trimmed;
  }

  if (digits.length > 0) {
    logger.warn("[normalizeIndianPhone] Could not normalize to 91XXXXXXXXXX", {
      raw_length: raw.length,
      digits_length: digits.length,
    });
  }

  return digits;
}

/** True when digits are exactly `91` + valid 10-digit Indian mobile. */
export function isValidCanonicalIndianWhatsAppPhone(phone: string): boolean {
  const normalized = normalizeIndianPhone(phone);
  return /^91[6-9]\d{9}$/.test(normalized);
}

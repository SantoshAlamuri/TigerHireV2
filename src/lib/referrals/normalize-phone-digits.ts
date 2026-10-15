import { normalizeIndianPhone } from "@/lib/whatsapp/normalize-phone";

/** Canonical digit form for matching candidate ↔ referral phone rows. */
export function normalizePhoneDigits(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const indian = normalizeIndianPhone(trimmed);
  if (/^91[6-9]\d{9}$/.test(indian)) return indian;
  return trimmed.replace(/\D/g, "");
}

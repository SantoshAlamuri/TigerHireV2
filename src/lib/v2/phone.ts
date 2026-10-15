/**
 * Indian phone numbers, displayed the way a recruiter reads them.
 *
 * Numbers arrive from a dozen sources — WhatsApp, Naukri forwards, agency
 * uploads, apply forms — each with its own dialling decoration: +91, a bare 91,
 * a leading 0, spaces, dashes, brackets, occasionally a doubled country code.
 * None of it is the number. The number is the last ten digits.
 *
 * Display therefore strips to ten digits and groups them; dialling keeps +91,
 * because a tel: link without a country code fails.
 */
const IN_MOBILE_DIGITS = 10;

/** The last ten digits, or null if there aren't ten. */
export function phoneDigits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < IN_MOBILE_DIGITS) return null;
  return digits.slice(-IN_MOBILE_DIGITS);
}

/** "98765 43210" — never a country code, never punctuation. */
export function indianPhone(raw: string | null | undefined): string {
  const d = phoneDigits(raw);
  if (!d) return "—";
  return `${d.slice(0, 5)} ${d.slice(5)}`;
}

/** tel: link — dialling still needs the country code the display drops. */
export function phoneHref(raw: string | null | undefined): string | null {
  const d = phoneDigits(raw);
  return d ? `tel:+91${d}` : null;
}

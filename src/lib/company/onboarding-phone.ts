/** TigerHire platform onboarding/support number — same for every company.
 *  Used as the default so the welcome banner always shows a real number even if
 *  NEXT_PUBLIC_COMPANY_ONBOARDING_PHONE isn't set in the deployment; the env var
 *  still takes precedence when present. */
const DEFAULT_COMPANY_ONBOARDING_PHONE = "+917674911055";

export function getCompanyOnboardingPhoneRaw(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_COMPANY_ONBOARDING_PHONE ?? "").trim();
  return fromEnv || DEFAULT_COMPANY_ONBOARDING_PHONE;
}

/** E.164-friendly href: keep leading + and digits; 10-digit local numbers assume India (+91). */
export function companyOnboardingTelHref(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const normalized = trimmed.replace(/[^\d+]/g, "");
  if (normalized.startsWith("+")) return `tel:${normalized}`;
  const digits = normalized.replace(/\D/g, "");
  if (digits.length === 10) return `tel:+91${digits}`;
  return digits ? `tel:${digits}` : "";
}

/** Human-readable label; accepts E.164 or 10-digit local (India). */
export function formatCompanyOnboardingPhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return trimmed;
}

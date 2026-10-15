/** Shared env for pilot / exhaustive E2E (see `.env.pilot-e2e.example`). */

export function pilotBaseUrl(): string {
  return (
    process.env.PILOT_BASE_URL ??
    process.env.SMOKE_BASE_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function pilotPassword(): string {
  return process.env.PILOT_PASSWORD ?? process.env.SEED_DEMO_PASSWORD ?? "demo123";
}

export function pilotJobTitle(): string {
  return (process.env.PILOT_JOB_TITLE ?? "Senior Backend Engineer — Bangalore").trim();
}

export function pilotJobId(): string | undefined {
  const id = process.env.PILOT_JOB_ID?.trim();
  return id || undefined;
}

/** Meta / session phone: digits only, typically 91 + 10-digit India. */
export function normalizePilotPhone(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length >= 10) return digits;
  return null;
}

export function pilotPhonesToClear(): string[] {
  const keys = [
    "PILOT_PHONE_SHATABDI",
    "PILOT_PHONE_SNIGDHA",
    "PILOT_PHONE_SANTOSH_NO",
    "PILOT_PHONE_LAKSHMI",
    "PILOT_PHONE_RAJIV",
    "PILOT_PHONE_MEERA",
    "PILOT_PHONE_INTERVIEWER",
    "PILOT_PHONE_FRESH",
  ] as const;
  const out = new Set<string>();
  for (const key of keys) {
    const n = normalizePilotPhone(process.env[key]);
    if (n) out.add(n);
  }
  return [...out];
}

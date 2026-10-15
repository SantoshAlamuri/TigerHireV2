/**
 * UK/Indian English display conventions for user-facing copy.
 * Storage formats (ISO dates, DB) stay unchanged — use only in UI, email, and toasts.
 */
export const DISPLAY_LOCALE = "en-GB" as const;
/** Default display timezone for interview and scheduling copy (India). */
export const DISPLAY_TIMEZONE = "Asia/Kolkata" as const;
export const DISPLAY_TIMEZONE_LABEL = "IST" as const;

/** Browser timezone for scheduling forms, e.g. `Europe/London (GMT+1)`. */
export function getBrowserTimezoneLabel(): string {
  if (typeof Intl === "undefined") return "";
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const offsetMin = -new Date().getTimezoneOffset();
    const sign = offsetMin >= 0 ? "+" : "-";
    const abs = Math.abs(offsetMin);
    const hours = Math.floor(abs / 60);
    const mins = abs % 60;
    const gmt = `GMT${sign}${hours}${mins ? `:${String(mins).padStart(2, "0")}` : ""}`;
    return `${tz} (${gmt})`;
  } catch {
    return "";
  }
}

const DEFAULT_DATE: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

/** User-facing date as DD/MM/YYYY (en-GB). */
export function formatDisplayDate(
  iso: string | number | Date,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(DISPLAY_LOCALE, options ?? DEFAULT_DATE);
}

/** Short label e.g. 16 May 2026 */
export function formatDisplayDateMedium(iso: string | number | Date): string {
  return formatDisplayDate(iso, { day: "numeric", month: "short", year: "numeric" });
}

/** Currency display for India — amounts assumed in INR unless noted. */
export function formatInrLakhs(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "—";
  return `₹${(amount / 100_000).toFixed(0)}L`;
}

export function formatInr(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat(DISPLAY_LOCALE, {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

const DEFAULT_DATETIME: Intl.DateTimeFormatOptions = {
  timeZone: DISPLAY_TIMEZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

/** User-facing date and time with IST label, e.g. 16 May 2026, 14:30 IST */
export function formatDisplayDateTime(
  iso: string | number | Date,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const formatted = d.toLocaleString(DISPLAY_LOCALE, { ...DEFAULT_DATETIME, ...options });
  return `${formatted} ${DISPLAY_TIMEZONE_LABEL}`;
}

/** Time only with IST, e.g. 14:30 IST */
export function formatDisplayTime(
  iso: string | number | Date,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const formatted = d.toLocaleTimeString(DISPLAY_LOCALE, {
    timeZone: DISPLAY_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  });
  return `${formatted} ${DISPLAY_TIMEZONE_LABEL}`;
}

function timezoneShortLabel(d: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
      timeZone,
      timeZoneName: "short",
    }).formatToParts(d);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

/** Date and time in an arbitrary IANA timezone with short zone label. */
export function formatDisplayDateTimeInZone(
  iso: string | number | Date,
  timeZone: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const formatted = d.toLocaleString(DISPLAY_LOCALE, {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  });
  return `${formatted} ${timezoneShortLabel(d, timeZone)}`;
}

/** Time only in an arbitrary IANA timezone with short zone label. */
export function formatDisplayTimeInZone(
  iso: string | number | Date,
  timeZone: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const formatted = d.toLocaleTimeString(DISPLAY_LOCALE, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  });
  return `${formatted} ${timezoneShortLabel(d, timeZone)}`;
}

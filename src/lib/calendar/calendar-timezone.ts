import { DISPLAY_TIMEZONE } from "@/lib/locale/display";

/** Curated zones for scheduling UI (grow list as needed). */
export const CALENDAR_TIMEZONE_OPTIONS = [
  { value: DISPLAY_TIMEZONE, label: "India (IST)" },
  { value: "UTC", label: "UTC" },
  { value: "Asia/Dubai", label: "Gulf (GST)" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Europe/London", label: "UK" },
  { value: "America/New_York", label: "US Eastern" },
] as const;

const BROWSER_TZ_VALUE = "__browser__";

export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DISPLAY_TIMEZONE;
  } catch {
    return DISPLAY_TIMEZONE;
  }
}

export function resolveCalendarTimezone(selected: string): string {
  if (selected === BROWSER_TZ_VALUE) return getBrowserTimezone();
  return selected;
}

export function calendarTimezoneSelectOptions(): { value: string; label: string }[] {
  const browser = getBrowserTimezone();
  const browserLabel = getTimezoneShortLabel(browser);
  return [
    { value: BROWSER_TZ_VALUE, label: `My device (${browserLabel})` },
    ...CALENDAR_TIMEZONE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
  ];
}

export function getTimezoneShortLabel(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      timeZoneName: "short",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

export function getZonedParts(iso: string | Date, timeZone: string) {
  const d = iso instanceof Date ? iso : new Date(iso);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

export function toDateKeyInTimezone(iso: string | Date, timeZone: string): string {
  const p = getZonedParts(iso, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function minutesSinceMidnightInTimezone(iso: string | Date, timeZone: string): number {
  const p = getZonedParts(iso, timeZone);
  return p.hour * 60 + p.minute;
}

function parseDateKey(key: string): { year: number; month: number; day: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { year: y, month: m, day: d };
}

export function addDaysToDateKey(key: string, days: number): string {
  const { year, month, day } = parseDateKey(key);
  const dt = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function dateFromKey(key: string): Date {
  const { year, month, day } = parseDateKey(key);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

const DOW_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function dayOfWeekInTimezone(d: Date, timeZone: string): number {
  const str = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(d);
  return DOW_MAP[str] ?? 0;
}

/** Monday-start week as YYYY-MM-DD keys in the given timezone. */
export function weekDayKeysInTimezone(anchor: Date, timeZone: string): string[] {
  const anchorKey = toDateKeyInTimezone(anchor, timeZone);
  const dow = dayOfWeekInTimezone(dateFromKey(anchorKey), timeZone);
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const mondayKey = addDaysToDateKey(anchorKey, mondayOffset);
  return Array.from({ length: 7 }, (_, i) => addDaysToDateKey(mondayKey, i));
}

export function formatDayLabelFromKey(key: string, timeZone: string): string {
  return dateFromKey(key).toLocaleDateString("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export type MonthGridCell = { key: string; inMonth: boolean; dayNum: number };

/** 6×7 month grid keys aligned to the anchor month in the given timezone. */
export function monthGridDayKeys(anchor: Date, timeZone: string): MonthGridCell[] {
  const p = getZonedParts(anchor, timeZone);
  const firstKey = `${p.year}-${String(p.month).padStart(2, "0")}-01`;
  const firstDow = dayOfWeekInTimezone(dateFromKey(firstKey), timeZone);
  const mondayOffset = firstDow === 0 ? -6 : 1 - firstDow;
  const gridStartKey = addDaysToDateKey(firstKey, mondayOffset);

  return Array.from({ length: 42 }, (_, i) => {
    const key = addDaysToDateKey(gridStartKey, i);
    const kp = parseDateKey(key);
    return {
      key,
      inMonth: kp.month === p.month && kp.year === p.year,
      dayNum: kp.day,
    };
  });
}

export const CALENDAR_TZ_STORAGE_KEY = "th-calendar-timezone";

export function loadStoredCalendarTimezone(): string {
  if (typeof window === "undefined") return BROWSER_TZ_VALUE;
  try {
    return sessionStorage.getItem(CALENDAR_TZ_STORAGE_KEY) ?? BROWSER_TZ_VALUE;
  } catch {
    return BROWSER_TZ_VALUE;
  }
}

export function storeCalendarTimezone(value: string): void {
  try {
    sessionStorage.setItem(CALENDAR_TZ_STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}

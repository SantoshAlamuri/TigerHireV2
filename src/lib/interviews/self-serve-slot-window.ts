import { DISPLAY_TIMEZONE } from "@/lib/locale/display";

/**
 * Calendar days (inclusive of today) that a candidate may pick on self-serve / WhatsApp.
 * Example: 3 → today, tomorrow, and the day after.
 */
export const SELF_SERVE_CANDIDATE_WINDOW_DAYS = 3;

type Ymd = { y: number; m: number; d: number };

function ymdKey({ y, m, d }: Ymd): number {
  return y * 10_000 + m * 100 + d;
}

function ymdFromParts(parts: Intl.DateTimeFormatPart[]): Ymd {
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  const d = Number(parts.find((p) => p.type === "day")!.value);
  return { y, m, d };
}

function ymdInTimeZone(instant: Date, timeZone: string): Ymd {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  return ymdFromParts(parts);
}

function addCalendarDays(ymd: Ymd, days: number): Ymd {
  const utc = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d + days));
  return { y: utc.getUTCFullYear(), m: utc.getUTCMonth() + 1, d: utc.getUTCDate() };
}

/** Latest inclusive calendar day a candidate may book (today + window − 1). */
export function getSelfServeCandidateLastBookableDay(
  now = new Date(),
  timeZone = DISPLAY_TIMEZONE,
): Ymd {
  return addCalendarDays(ymdInTimeZone(now, timeZone), SELF_SERVE_CANDIDATE_WINDOW_DAYS - 1);
}

/**
 * Whether a slot start is bookable by a candidate: not in the past, and within the next few calendar days.
 */
export function isSlotEligibleForCandidateSelfServe(
  startAt: string | Date,
  now = new Date(),
  timeZone = DISPLAY_TIMEZONE,
): boolean {
  const start = typeof startAt === "string" ? new Date(startAt) : startAt;
  if (Number.isNaN(start.getTime()) || start.getTime() < now.getTime()) {
    return false;
  }

  const startDay = ymdKey(ymdInTimeZone(start, timeZone));
  const today = ymdKey(ymdInTimeZone(now, timeZone));
  const lastDay = ymdKey(getSelfServeCandidateLastBookableDay(now, timeZone));

  return startDay >= today && startDay <= lastDay;
}

/** End instant (exclusive) for DB queries: start of the day after the last bookable day in tz. */
export function getSelfServeCandidateHorizonEnd(
  now = new Date(),
  timeZone = DISPLAY_TIMEZONE,
): Date {
  const last = getSelfServeCandidateLastBookableDay(now, timeZone);
  const afterLast = addCalendarDays(last, 1);
  // Midnight after last bookable day in tz → approximate with UTC noon anchor (good enough for .lte filters).
  return new Date(Date.UTC(afterLast.y, afterLast.m - 1, afterLast.d, 18, 30, 0));
}

export function selfServeCandidateWindowLabel(): string {
  return `the next ${SELF_SERVE_CANDIDATE_WINDOW_DAYS} days`;
}

/** `min` attribute for `<input type="datetime-local" />` — no past times. */
export function toDatetimeLocalMin(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const d = new Date(now);
  d.setSeconds(0, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `min` attribute for `<input type="date" />` — today in local browser time. */
export function toDateInputMin(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isSlotStartInPast(startAt: string | Date, now = new Date()): boolean {
  const t = new Date(startAt).getTime();
  return Number.isNaN(t) || t < now.getTime();
}

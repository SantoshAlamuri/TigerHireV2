/**
 * Picking an interview time: the next two weeks as days, each day as times.
 * Pure helpers so the picker stays simple and the rules are tested.
 */

export const WINDOW_DAYS = 14;
export const TZ = "Asia/Kolkata";
const MIN = 60_000;

export interface Day {
  key: string; // YYYY-MM-DD in TZ
  weekday: string; // "Mon"
  date: number; // 19
  month: string; // "Oct"
  weekend: boolean;
  today: boolean;
}

export interface Range {
  start: number;
  end: number;
}

/** A time the person can choose: an already-open slot, or a new time to open. */
export type Choice =
  | { kind: "open"; slotId: string; start: number; end: number; owner: string | null }
  | { kind: "new"; start: number; end: number; free: "everyone" | "unchecked" };

const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: TZ, ...opts });

export function dayKey(t: number): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(t));
}

/** IST is a fixed +5:30, so a local wall time maps to UTC directly. */
export function localTime(key: string, minutes: number): number {
  return Date.parse(`${key}T00:00:00+05:30`) + minutes * MIN;
}

/** Today and the next 13 days. */
export function nextDays(now: number, count = WINDOW_DAYS): Day[] {
  const out: Day[] = [];
  const todayKey = dayKey(now);
  for (let i = 0; i < count; i++) {
    const key = dayKey(localTime(todayKey, 12 * 60) + i * 24 * 60 * MIN);
    const noon = localTime(key, 12 * 60);
    const weekday = fmt({ weekday: "short" }).format(noon);
    out.push({
      key,
      weekday,
      date: Number(fmt({ day: "numeric" }).format(noon)),
      month: fmt({ month: "short" }).format(noon),
      weekend: weekday === "Sat" || weekday === "Sun",
      today: i === 0,
    });
  }
  return out;
}

export function timeLabel(t: number): string {
  return fmt({ hour: "numeric", minute: "2-digit" }).format(t).replace(" ", " ").toLowerCase();
}

export function longLabel(t: number): string {
  return fmt({
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  })
    .format(t)
    .toLowerCase()
    .replace(/^\w|\s\w{3}\b/g, (m) => m.toUpperCase());
}

const overlaps = (a: Range, b: Range) => a.start < b.end && b.start < a.end;

/**
 * Every 30-minute start between 9am and 8pm on a day, with whether the panel
 * is busy then. Past times and times inside the notice period are left out.
 */
export function dayGrid(
  key: string,
  durationMinutes: number,
  busy: Range[],
  now: number,
  minNoticeMinutes = 60,
): { start: number; end: number; busy: boolean }[] {
  const out: { start: number; end: number; busy: boolean }[] = [];
  for (let m = 9 * 60; m + durationMinutes <= 20 * 60; m += 30) {
    const start = localTime(key, m);
    const end = start + durationMinutes * MIN;
    if (start < now + minNoticeMinutes * MIN) continue;
    out.push({ start, end, busy: busy.some((b) => overlaps({ start, end }, b)) });
  }
  return out;
}

/** Choices grouped by day key, each day sorted. */
export function byDay<T extends { start: number }>(list: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const c of [...list].sort((a, b) => a.start - b.start)) {
    const k = dayKey(c.start);
    m.set(k, [...(m.get(k) ?? []), c]);
  }
  return m;
}

/** Open slots and suggested free times, without suggesting a time already open. */
export function mergeChoices(open: Choice[], suggested: Choice[]): Choice[] {
  const taken = open.map((o) => ({ start: o.start, end: o.end }));
  return [...open, ...suggested.filter((s) => !taken.some((t) => overlaps(t, s)))].sort(
    (a, b) => a.start - b.start,
  );
}

export const choiceKey = (c: Choice) => (c.kind === "open" ? c.slotId : `new:${c.start}`);

/** The first day in the window that has something to offer. */
export function firstUsefulDay(days: Day[], grouped: Map<string, unknown[]>): string {
  return (
    days.find((d) => (grouped.get(d.key)?.length ?? 0) > 0)?.key ??
    days.find((d) => !d.weekend && !d.today)?.key ??
    days[0]?.key ??
    ""
  );
}

/**
 * "Your usual week" for interview availability.
 *
 * The API stores concrete windows. People think in a usual week, so the screen
 * asks for days and hours once and lays them out as windows for the next few
 * weeks, skipping anything already covered or already past. All times are the
 * person's local time.
 */

export interface UsualWeek {
  /** 0 = Sunday … 6 = Saturday, as Date#getDay. */
  days: number[];
  /** "HH:MM", 24-hour. */
  from: string;
  to: string;
  weeks: number;
}

export interface WindowSpan {
  starts_at: string;
  ends_at: string;
}

export const WEEK_PATTERN = "weekly";

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
/** Monday first, the way most people read a working week. */
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export const DEFAULT_WEEK: UsualWeek = {
  days: [1, 2, 3, 4, 5],
  from: "10:00",
  to: "17:00",
  weeks: 4,
};

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function weekProblem(w: UsualWeek): string | null {
  if (w.days.length === 0) return "Pick at least one day.";
  if (minutes(w.to) <= minutes(w.from)) return "The end time needs to be after the start.";
  return null;
}

function at(day: Date, hhmm: string): Date {
  const d = new Date(day);
  const [h, m] = hhmm.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

function overlaps(a: WindowSpan, b: WindowSpan): boolean {
  return new Date(a.starts_at) < new Date(b.ends_at) && new Date(b.starts_at) < new Date(a.ends_at);
}

/** The windows to create for this usual week, leaving out past times and ones already covered. */
export function planWeek(w: UsualWeek, existing: WindowSpan[], now = new Date()): WindowSpan[] {
  if (weekProblem(w)) return [];
  const out: WindowSpan[] = [];
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  for (let i = 0; i < w.weeks * 7; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    if (!w.days.includes(day.getDay())) continue;
    const span = {
      starts_at: at(day, w.from).toISOString(),
      ends_at: at(day, w.to).toISOString(),
    };
    if (new Date(span.starts_at) <= now) continue;
    if (existing.some((e) => overlaps(e, span))) continue;
    out.push(span);
  }
  return out;
}

export interface DayGroup {
  key: string;
  label: string;
  windows: { id: string; time: string }[];
}

/** Upcoming windows grouped by day, for a calm list instead of a calendar grid. */
export function groupByDay(windows: (WindowSpan & { id: string })[], now = new Date()): DayGroup[] {
  const fmtDay = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const fmtTime = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  const groups = new Map<string, DayGroup>();
  [...windows]
    .filter((w) => new Date(w.ends_at) > now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .forEach((w) => {
      const s = new Date(w.starts_at);
      const key = `${s.getFullYear()}-${s.getMonth()}-${s.getDate()}`;
      const g = groups.get(key) ?? { key, label: fmtDay.format(s), windows: [] };
      g.windows.push({
        id: w.id,
        time: `${fmtTime.format(s)} – ${fmtTime.format(new Date(w.ends_at))}`,
      });
      groups.set(key, g);
    });
  return [...groups.values()];
}

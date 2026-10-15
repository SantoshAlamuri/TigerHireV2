/** Shared date helpers for org calendar views (week/month grids and API ranges). */

export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function toLocalDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

/** Monday-start week containing `anchor`, plus range end (exclusive) for API queries. */
export function weekRangeFromAnchor(anchor: Date): { from: Date; to: Date; weekStart: Date } {
  const weekStart = startOfWeek(anchor);
  return { from: weekStart, to: addDays(weekStart, 7), weekStart };
}

export function monthRangeFromAnchor(anchor: Date): { from: Date; to: Date } {
  return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
}

/** Cells for a month grid (includes leading/trailing days from adjacent months). */
export function monthGridDays(anchor: Date): Date[] {
  const first = startOfMonth(anchor);
  const gridStart = startOfWeek(first);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(addDays(gridStart, i));
  }
  return days;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return toLocalDateKey(a) === toLocalDateKey(b);
}

export function isSameMonth(a: Date, anchor: Date): boolean {
  return a.getFullYear() === anchor.getFullYear() && a.getMonth() === anchor.getMonth();
}

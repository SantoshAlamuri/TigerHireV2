/**
 * Finding times a whole interview panel is free. Pure: no I/O, all times in
 * epoch milliseconds, so it is easy to test and reason about.
 *
 * A person's availability is their working hours (or the hours they declared)
 * minus what their calendar says is busy. A slot is offered only when every
 * panel member is available for the whole interview plus the buffer.
 */

export interface Interval {
  start: number;
  end: number;
}

export interface WorkingHours {
  /** IANA zone the hours are in, e.g. "Asia/Kolkata". */
  timeZone: string;
  /** 0 = Sunday … 6 = Saturday. */
  days: number[];
  /** Minutes after local midnight. */
  startMinute: number;
  endMinute: number;
}

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  timeZone: "Asia/Kolkata",
  days: [1, 2, 3, 4, 5],
  startMinute: 10 * 60,
  endMinute: 18 * 60,
};

export interface PanelMember {
  userId: string;
  /** Hours they can be booked in. Declared windows replace working hours when present. */
  available: Interval[];
  busy: Interval[];
}

export interface SlotOptions {
  from: number;
  to: number;
  durationMinutes: number;
  /** Free time required before and after, so interviews don't run back to back. */
  bufferMinutes: number;
  /** Start times land on this grid (minutes). */
  stepMinutes: number;
  /** No slot starts sooner than this from `now`. */
  minNoticeMinutes: number;
  now: number;
  /** At most this many per local day, spread across the day. */
  maxPerDay: number;
  timeZone: string;
}

const MIN = 60_000;

/** Merge overlapping or touching intervals; sorted output. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

/** `a` minus everything in `b`. */
export function subtractIntervals(a: Interval[], b: Interval[]): Interval[] {
  const cut = mergeIntervals(b);
  const out: Interval[] = [];
  for (const base of mergeIntervals(a)) {
    let pieces: Interval[] = [base];
    for (const c of cut) {
      if (c.end <= base.start || c.start >= base.end) continue;
      pieces = pieces.flatMap((p) => {
        if (c.end <= p.start || c.start >= p.end) return [p];
        const keep: Interval[] = [];
        if (c.start > p.start) keep.push({ start: p.start, end: c.start });
        if (c.end < p.end) keep.push({ start: c.end, end: p.end });
        return keep;
      });
    }
    out.push(...pieces);
  }
  return out;
}

/** Times present in every list. */
export function intersectAll(lists: Interval[][]): Interval[] {
  if (!lists.length) return [];
  let acc = mergeIntervals(lists[0]);
  for (const next of lists.slice(1)) {
    const b = mergeIntervals(next);
    const out: Interval[] = [];
    let i = 0;
    let j = 0;
    while (i < acc.length && j < b.length) {
      const start = Math.max(acc[i].start, b[j].start);
      const end = Math.min(acc[i].end, b[j].end);
      if (end > start) out.push({ start, end });
      if (acc[i].end < b[j].end) i++;
      else j++;
    }
    acc = out;
  }
  return acc;
}

/** Offset of `timeZone` from UTC at instant `t`, in minutes. */
export function zoneOffsetMinutes(t: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(t));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - Math.floor(t / 1000) * 1000) / MIN);
}

/** Local calendar day key (YYYY-MM-DD) and weekday for an instant in a zone. */
export function localDay(t: number, timeZone: string): { key: string; weekday: number } {
  const shifted = new Date(t + zoneOffsetMinutes(t, timeZone) * MIN);
  return {
    key: shifted.toISOString().slice(0, 10),
    weekday: shifted.getUTCDay(),
  };
}

/** Working hours expanded into concrete intervals between `from` and `to`. */
export function expandWorkingHours(h: WorkingHours, from: number, to: number): Interval[] {
  const out: Interval[] = [];
  // Walk local days; start a day early so zones ahead of UTC are covered.
  const first = from - 24 * 60 * MIN;
  for (let t = first; t < to + 24 * 60 * MIN; t += 24 * 60 * MIN) {
    const { key, weekday } = localDay(t, h.timeZone);
    if (!h.days.includes(weekday)) continue;
    const midnightLocalAsUtc = Date.parse(`${key}T00:00:00Z`);
    const offset = zoneOffsetMinutes(midnightLocalAsUtc + 12 * 60 * MIN, h.timeZone);
    const start = midnightLocalAsUtc + (h.startMinute - offset) * MIN;
    const end = midnightLocalAsUtc + (h.endMinute - offset) * MIN;
    const s = Math.max(start, from);
    const e = Math.min(end, to);
    if (e > s) out.push({ start: s, end: e });
  }
  return mergeIntervals(out);
}

/**
 * Start times when the whole panel is free. Spreads picks across each day
 * (morning, midday, afternoon) rather than offering the first N in a row.
 */
export function findPanelSlots(panel: PanelMember[], o: SlotOptions): Interval[] {
  if (!panel.length || o.durationMinutes <= 0) return [];
  const dur = o.durationMinutes * MIN;
  const buf = o.bufferMinutes * MIN;
  const step = Math.max(5, o.stepMinutes) * MIN;
  const earliest = Math.max(o.from, o.now + o.minNoticeMinutes * MIN);

  const free = intersectAll(
    panel.map((p) =>
      subtractIntervals(
        p.available,
        p.busy.map((b) => ({ start: b.start - buf, end: b.end + buf })),
      ),
    ),
  );

  const candidates: Interval[] = [];
  for (const f of free) {
    let t = Math.ceil(Math.max(f.start, earliest) / step) * step;
    for (; t + dur <= Math.min(f.end, o.to); t += step) {
      candidates.push({ start: t, end: t + dur });
    }
  }

  // Group by local day and pick evenly across the day.
  const byDay = new Map<string, Interval[]>();
  for (const c of candidates) {
    const k = localDay(c.start, o.timeZone).key;
    const list = byDay.get(k) ?? [];
    list.push(c);
    byDay.set(k, list);
  }
  const out: Interval[] = [];
  for (const list of byDay.values()) {
    if (list.length <= o.maxPerDay) {
      out.push(...list);
      continue;
    }
    const picked: Interval[] = [];
    for (let i = 0; i < o.maxPerDay; i++) {
      const idx = Math.round((i * (list.length - 1)) / Math.max(1, o.maxPerDay - 1));
      const c = list[idx];
      // Never offer overlapping picks.
      if (!picked.some((p) => c.start < p.end && p.start < c.end)) picked.push(c);
    }
    out.push(...picked);
  }
  return out.sort((a, b) => a.start - b.start);
}

/** True when an already-opened slot now clashes with someone's calendar. */
export function clashes(slot: Interval, busy: Interval[], bufferMinutes = 0): boolean {
  const buf = bufferMinutes * MIN;
  return busy.some((b) => slot.start < b.end + buf && b.start - buf < slot.end);
}

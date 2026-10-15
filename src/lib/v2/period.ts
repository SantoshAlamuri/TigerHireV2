/**
 * Reporting periods for analytics.
 *
 * Until now every number on the analytics screen was computed over "whatever
 * the last 100 applications happened to be". A time-to-fill with no period
 * attached cannot be checked, compared to last quarter, or defended when
 * someone asks where it came from.
 *
 * The financial year runs April to March. This is an India-first product, and a
 * screen that labels January as the new FY reports a quarter of the year's
 * hiring against the wrong year — while still looking perfectly plausible.
 */
export type PeriodKey =
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "this_year"
  | "this_fy"
  | "last_fy"
  | "rolling_12"
  | "all_time"
  | "custom";

export interface Period {
  key: PeriodKey;
  /** Inclusive start, or null for all time. */
  start: number | null;
  /** Exclusive end, so adjacent periods cannot double-count a row. */
  end: number;
  label: string;
}

export const PERIODS: { key: PeriodKey; short: string }[] = [
  { key: "this_month", short: "This month" },
  { key: "last_month", short: "Last month" },
  { key: "this_quarter", short: "This quarter" },
  { key: "last_quarter", short: "Last quarter" },
  { key: "this_year", short: "This year" },
  { key: "this_fy", short: "This FY" },
  { key: "last_fy", short: "Last FY" },
  { key: "rolling_12", short: "Rolling 12m" },
  { key: "all_time", short: "All time" },
  { key: "custom", short: "Custom range" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const utc = (y: number, m: number, d = 1) => Date.UTC(y, m, d);

/** The April-to-March year a moment belongs to, named by its opening year. */
function financialYearStart(y: number, m: number): number {
  return m >= 3 ? y : y - 1;
}

function fyLabel(startYear: number): string {
  return `FY ${startYear}–${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/**
 * A user-supplied range. Invalid or reversed dates fall back to all time rather
 * than producing an empty window that would read as "no data".
 */
export function resolveCustomPeriod(from: string, to: string, now: number): Period {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return resolvePeriod("all_time", now);
  return {
    key: "custom",
    start: a,
    // Inclusive of the chosen end day, which is what a person picking a date
    // means — an exclusive end silently drops the last day's activity.
    end: b + 86_400_000,
    label: `${from} to ${to}`,
  };
}

export function resolvePeriod(key: string, now: number): Period {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const quarterStartMonth = Math.floor(m / 3) * 3;

  switch (key) {
    case "this_month":
      return {
        key: "this_month",
        start: utc(y, m),
        end: utc(y, m + 1),
        label: `${MONTHS[m]} ${y}`,
      };
    case "last_month": {
      const start = utc(y, m - 1);
      const s = new Date(start);
      return {
        key: "last_month",
        start,
        end: utc(y, m),
        label: `${MONTHS[s.getUTCMonth()]} ${s.getUTCFullYear()}`,
      };
    }
    case "this_quarter":
      return {
        key: "this_quarter",
        start: utc(y, quarterStartMonth),
        end: utc(y, quarterStartMonth + 3),
        label: `Q${Math.floor(m / 3) + 1} ${y}`,
      };
    case "last_quarter": {
      const start = utc(y, quarterStartMonth - 3);
      const s = new Date(start);
      return {
        key: "last_quarter",
        start,
        end: utc(y, quarterStartMonth),
        label: `Q${Math.floor(s.getUTCMonth() / 3) + 1} ${s.getUTCFullYear()}`,
      };
    }
    case "this_year":
      return { key: "this_year", start: utc(y, 0), end: utc(y + 1, 0), label: String(y) };
    case "this_fy": {
      const fy = financialYearStart(y, m);
      return { key: "this_fy", start: utc(fy, 3), end: utc(fy + 1, 3), label: fyLabel(fy) };
    }
    case "last_fy": {
      const fy = financialYearStart(y, m) - 1;
      return { key: "last_fy", start: utc(fy, 3), end: utc(fy + 1, 3), label: fyLabel(fy) };
    }
    case "rolling_12": {
      // Twelve months back from today, not from the start of the month — a
      // rolling window that snapped to month boundaries would not be rolling.
      const s = new Date(now);
      s.setUTCFullYear(s.getUTCFullYear() - 1);
      return {
        key: "rolling_12",
        start: s.getTime(),
        end: now + 1,
        label: "Rolling 12 months",
      };
    }
    default:
      // Unbounded rather than an invented epoch, and the fallback for anything
      // unrecognised so a stale saved preference cannot break the screen.
      return { key: "all_time", start: null, end: now + 1, label: "All time" };
  }
}

export function withinPeriod(iso: string | null | undefined, p: Period): boolean {
  if (p.start === null) return true;
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return t >= p.start && t < p.end;
}

/**
 * Trend views: application volume over time, and how long each stage takes now
 * versus last quarter.
 *
 * The stage table is the dangerous one. `applications` records created_at and
 * updated_at and nothing else — there is no stage-transition history — so the
 * only durations that exist are "applied to whenever this row was last
 * touched". Filling the other rows in with plausible numbers would put invented
 * stage velocities in front of a hiring manager deciding where the process is
 * slow. Those rows return null and say the timestamps are not recorded, which
 * also names the schema gap worth closing.
 */
const DAY = 86_400_000;

export interface WeekBucket {
  /** ISO date of the week's start. */
  week: string;
  count: number;
}

export function applicationsPerWeek(
  rows: { createdAt: string | null }[],
  weeks: number,
  now: number,
): WeekBucket[] {
  const buckets: WeekBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    buckets.push({ week: new Date(now - i * 7 * DAY).toISOString().slice(0, 10), count: 0 });
  }
  for (const r of rows) {
    if (!r.createdAt) continue;
    const t = Date.parse(r.createdAt);
    if (Number.isNaN(t) || t > now) continue;
    const idx = weeks - 1 - Math.floor((now - t) / (7 * DAY));
    if (idx >= 0 && idx < weeks) buckets[idx].count += 1;
  }
  return buckets;
}

export interface VelRow {
  status: string;
  createdAt: string | null;
  decidedAt: string | null;
}

export interface StageVelocity {
  stage: string;
  /** Median days this quarter, or null when the schema cannot answer. */
  now: number | null;
  /** Median days the quarter before, for comparison. */
  prior: number | null;
  driver: string;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function daysBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / DAY);
}

/** Stages whose duration the current schema genuinely cannot answer. */
const UNTIMED = ["Screened → Interview", "Interview → Offer", "Offer → Accepted"] as const;

export function stageVelocity(rows: VelRow[], now: number): StageVelocity[] {
  const quarterStart = now - 91 * DAY;
  const priorStart = now - 182 * DAY;

  const decided = rows.filter((r) => r.decidedAt);
  const inWindow = (r: VelRow, from: number, to: number) => {
    const t = Date.parse(r.decidedAt ?? "");
    return !Number.isNaN(t) && t >= from && t < to;
  };

  const span = (subset: VelRow[]) =>
    median(
      subset
        .map((r) => daysBetween(r.createdAt, r.decidedAt))
        .filter((d): d is number => d !== null),
    );

  const build = (stage: string, subset: VelRow[]): StageVelocity => {
    const nowVal = span(subset.filter((r) => inWindow(r, quarterStart, now + DAY)));
    const priorVal = span(subset.filter((r) => inWindow(r, priorStart, quarterStart)));
    let driver: string;
    if (nowVal === null) driver = "No decisions in this quarter yet";
    else if (priorVal === null) driver = "No prior quarter to compare against";
    else if (nowVal < priorVal) driver = `${priorVal - nowVal} days faster than last quarter`;
    else if (nowVal > priorVal) driver = `${nowVal - priorVal} days slower than last quarter`;
    else driver = "Unchanged from last quarter";
    return { stage, now: nowVal, prior: priorVal, driver };
  };

  return [
    build("Applied → Decision", decided),
    build(
      "Applied → Hire",
      decided.filter((r) => r.status === "hired"),
    ),
    ...UNTIMED.map((stage) => ({
      stage,
      now: null,
      prior: null,
      // Names the schema gap rather than papering over it with a number.
      driver: "Stage transition times are not recorded yet",
    })),
  ];
}

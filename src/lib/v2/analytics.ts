/**
 * Analytics derivations.
 *
 * "Difficult reporting" is the top complaint about the incumbent this competes
 * with, so every figure here is computed from application rows the product
 * already stores — no separate reporting pipeline to drift out of sync, and no
 * silent divide-by-zero producing a confident-looking wrong number.
 */
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export interface FunnelRow {
  status: string;
}

export interface Funnel {
  applied: number;
  reviewed: number;
  shortlisted: number;
  hired: number;
  rejected: number;
  conversion: {
    appliedToShortlist: number;
    shortlistToHire: number;
    appliedToHire: number;
  };
}

export function computeFunnel(rows: FunnelRow[]): Funnel {
  const applied = rows.length;
  const hired = rows.filter((r) => r.status === "hired").length;
  // Anyone hired necessarily cleared the shortlist bar.
  const shortlisted = rows.filter((r) => r.status === "shortlisted").length + hired;
  const reviewed = rows.filter((r) => r.status !== "applied").length;
  const rejected = rows.filter((r) => r.status === "rejected").length;

  return {
    applied,
    reviewed,
    shortlisted,
    hired,
    rejected,
    conversion: {
      appliedToShortlist: pct(shortlisted, applied),
      shortlistToHire: pct(hired, shortlisted),
      appliedToHire: pct(hired, applied),
    },
  };
}

export interface SourceRow {
  source: string | null;
  status: string;
}

export interface SourceOfHire {
  source: string;
  applicants: number;
  hires: number;
  conversion: number;
}

export function computeSourceOfHire(rows: SourceRow[]): SourceOfHire[] {
  const map = new Map<string, { applicants: number; hires: number }>();
  for (const r of rows) {
    const key = r.source?.trim() || "unknown";
    const entry = map.get(key) ?? { applicants: 0, hires: 0 };
    entry.applicants++;
    if (r.status === "hired") entry.hires++;
    map.set(key, entry);
  }
  return [...map.entries()]
    .map(([source, v]) => ({
      source,
      applicants: v.applicants,
      hires: v.hires,
      conversion: pct(v.hires, v.applicants),
    }))
    .sort((a, b) => b.conversion - a.conversion || b.applicants - a.applicants);
}

export interface RejectRow {
  rejection_reason?: string | null;
}

export interface RejectMix {
  rows: { reason: string; count: number; percent: number }[];
  total: number;
  /** Share of rejections that carry a reason — a gap here is shown, not hidden. */
  coveragePercent: number;
}

export function computeRejectMix(rows: RejectRow[]): RejectMix {
  const total = rows.length;
  const counts = new Map<string, number>();
  let withReason = 0;
  for (const r of rows) {
    const reason = r.rejection_reason?.trim() || "unspecified";
    if (reason !== "unspecified") withReason++;
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return {
    rows: [...counts.entries()]
      .map(([reason, count]) => ({ reason, count, percent: pct(count, total) }))
      .sort((a, b) => b.count - a.count),
    total,
    coveragePercent: pct(withReason, total),
  };
}

// ── Expanded metrics ────────────────────────────────────────────────────────
// "Difficult reporting" is the top complaint recruiters make about incumbent
// ATSs. These keep to three rules: derive from stored data, stay drillable to a
// job, and be honest about gaps — an unscored candidate is counted as unscored,
// never quietly folded into the bottom band.

export interface TimingRow {
  jobId: string;
  jobTitle: string;
  status: string;
  score: number | null;
  createdAt: string | null;
  /** When a terminal decision was recorded, if one was. */
  decidedAt: string | null;
}

export interface TimeMetrics {
  medianDaysToDecision: number | null;
  decided: number;
  pending: number;
  waitingOverAWeek: number;
}

const DAY_MS = 86_400_000;

export function computeTimeMetrics(rows: TimingRow[], now: number = Date.now()): TimeMetrics {
  const durations: number[] = [];
  let pending = 0;
  let waitingOverAWeek = 0;

  for (const r of rows) {
    const created = r.createdAt ? Date.parse(r.createdAt) : NaN;
    if (!r.decidedAt) {
      pending++;
      if (!Number.isNaN(created) && now - created > 7 * DAY_MS) waitingOverAWeek++;
      continue;
    }
    const decided = Date.parse(r.decidedAt);
    // A reversed or unparseable pair is bad data, not a zero-day decision.
    if (Number.isNaN(created) || Number.isNaN(decided) || decided < created) continue;
    durations.push(Math.round((decided - created) / DAY_MS));
  }

  durations.sort((a, b) => a - b);
  const median =
    durations.length === 0
      ? null
      : durations.length % 2 === 1
        ? durations[(durations.length - 1) / 2]
        : Math.round((durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2);

  return { medianDaysToDecision: median, decided: durations.length, pending, waitingOverAWeek };
}

export interface JobTableRow {
  jobId: string;
  jobTitle: string;
  applicants: number;
  scored: number;
  shortlisted: number;
  hired: number;
  rejected: number;
  /** Every applicant unscored — usually an unapproved rubric, and invisible today. */
  allUnscored: boolean;
}

export function computeJobTable(rows: TimingRow[]): JobTableRow[] {
  const byJob = new Map<string, JobTableRow>();
  for (const r of rows) {
    const existing = byJob.get(r.jobId) ?? {
      jobId: r.jobId,
      jobTitle: r.jobTitle,
      applicants: 0,
      scored: 0,
      shortlisted: 0,
      hired: 0,
      rejected: 0,
      allUnscored: false,
    };
    existing.applicants++;
    if (typeof r.score === "number" && r.score > 0) existing.scored++;
    if (r.status === "shortlisted") existing.shortlisted++;
    if (r.status === "hired") existing.hired++;
    if (r.status === "rejected") existing.rejected++;
    byJob.set(r.jobId, existing);
  }
  return [...byJob.values()]
    .map((r) => ({ ...r, allUnscored: r.applicants > 0 && r.scored === 0 }))
    .sort((a, b) => b.applicants - a.applicants);
}

export interface ScoreBand {
  label: string;
  min: number;
  count: number;
}

export interface ScoreBands {
  bands: ScoreBand[];
  scored: number;
  unscored: number;
}

export function computeScoreBands(rows: TimingRow[]): ScoreBands {
  const bands: ScoreBand[] = [
    { label: "90+", min: 90, count: 0 },
    { label: "75–89", min: 75, count: 0 },
    { label: "60–74", min: 60, count: 0 },
    { label: "below 60", min: 0, count: 0 },
  ];
  let scored = 0;
  let unscored = 0;

  for (const r of rows) {
    if (typeof r.score !== "number" || r.score <= 0) {
      unscored++;
      continue;
    }
    scored++;
    const band = bands.find((b) => r.score! >= b.min);
    if (band) band.count++;
  }

  return { bands, scored, unscored };
}

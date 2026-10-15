/**
 * The ideal candidate (ICP) and the market around it.
 *
 * One editable model for everything the agent scores against: level, years,
 * must / should / nice-to-haves, outcomes, competencies, traits, background
 * and certifications. Plus the market read: pay range against your bands and
 * against what applicants actually ask for.
 */
import type { IdealCandidateProfile } from "@/lib/fitscore/hybrid/ideal-profile";
import {
  mergeCertificationsIntoBenchmarks,
  parseCertificationsFromBenchmarks,
} from "@/lib/fitscore/jd-base-approval/certifications";
import {
  formatYearsRange,
  parseYearsRange,
  roleLevelFromYearsRange,
  suggestLevelFromJobText,
  yearsRangeForLevel,
  type RoleLevel,
} from "@/lib/fitscore/jd-base-approval/years-range";

export type { RoleLevel };

export interface StructuredJdLike {
  role_basics?: Record<string, unknown>;
  responsibilities?: string[];
  must_haves?: string[];
  need_to_haves?: string[];
  nice_to_haves?: string[];
}

export interface ProfileDraft {
  summary: string;
  level: RoleLevel;
  yearsMin: number;
  yearsMax: number;
  must: string[];
  should: string[];
  nice: string[];
  outcomes: string[];
  competencies: string[];
  traits: string[];
  background: string[];
  certifications: string[];
}

export const LEVELS: { value: RoleLevel; label: string }[] = [
  { value: "junior", label: "Junior" },
  { value: "mid", label: "Mid" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead" },
];

const clean = (xs: (string | null | undefined)[] | null | undefined) => {
  const out: string[] = [];
  for (const x of xs ?? []) {
    const t = (x ?? "").trim();
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
};

export function draftFromJdBase(
  icp: Partial<IdealCandidateProfile> | null | undefined,
  structured: StructuredJdLike | null | undefined,
  jobText: string,
): ProfileDraft {
  const level = icp?.years_range
    ? roleLevelFromYearsRange(icp.years_range)
    : suggestLevelFromJobText(jobText);
  const years = (icp?.years_range && parseYearsRange(icp.years_range)) ||
    parseYearsRange(yearsRangeForLevel(level)) || { min: 2, max: 5 };
  return {
    summary: icp?.summary?.trim() ?? "",
    level,
    yearsMin: years.min,
    yearsMax: years.max,
    must: clean(icp?.must_haves),
    should: clean(structured?.need_to_haves),
    nice: clean(icp?.nice_to_haves),
    outcomes: clean(icp?.outcomes),
    competencies: clean(icp?.competencies),
    traits: clean(icp?.traits),
    background: clean(icp?.background_preferences),
    certifications: parseCertificationsFromBenchmarks(icp?.benchmarks),
  };
}

/** Changing the level moves years to that level's usual range. */
export function withLevel(d: ProfileDraft, level: RoleLevel): ProfileDraft {
  const r = parseYearsRange(yearsRangeForLevel(level));
  return { ...d, level, yearsMin: r?.min ?? d.yearsMin, yearsMax: r?.max ?? d.yearsMax };
}

/** Body for PUT /api/fitscore/jd-base. Keeps what this screen doesn't edit. */
export function saveBody(
  jobId: string,
  d: ProfileDraft,
  existing: {
    icp?: Partial<IdealCandidateProfile> | null;
    structured?: StructuredJdLike | null;
    title: string;
  },
) {
  const idealCandidateProfile: IdealCandidateProfile = {
    summary: d.summary.trim() || `Ideal ${existing.title} candidate`,
    must_haves: clean(d.must),
    nice_to_haves: clean(d.nice),
    years_range: formatYearsRange(
      Math.min(d.yearsMin, d.yearsMax),
      Math.max(d.yearsMin, d.yearsMax),
    ),
    benchmarks: mergeCertificationsIntoBenchmarks(
      existing.icp?.benchmarks ?? {},
      clean(d.certifications),
    ),
    outcomes: clean(d.outcomes),
    competencies: clean(d.competencies),
    traits: clean(d.traits),
    background_preferences: clean(d.background),
  };
  return {
    jobId,
    idealCandidateProfile,
    structuredJd: {
      role_basics: { ...(existing.structured?.role_basics ?? {}), title: existing.title },
      responsibilities: existing.structured?.responsibilities ?? [],
      must_haves: clean(d.must),
      need_to_haves: clean(d.should),
      nice_to_haves: clean(d.nice),
    },
  };
}

export function profileProblems(d: ProfileDraft): string[] {
  const out: string[] = [];
  if (!clean(d.must).length) out.push("Add at least one must-have.");
  if (clean(d.must).length > 12) out.push("Keep must-haves to 12; move the rest down a level.");
  if (d.yearsMin < 0 || d.yearsMax > 40) out.push("Years should be between 0 and 40.");
  return out;
}

export function sameDraft(a: ProfileDraft, b: ProfileDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* ---------------- market: pay ---------------- */

export interface PayBand {
  label: string;
  min_amount: number;
  max_amount: number;
  currency: string;
}

export const lpa = (rupees: number | null | undefined): string =>
  rupees && rupees > 0 ? `₹${Math.round((rupees / 100_000) * 10) / 10} LPA` : "—";

export function median(xs: number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export interface PayRead {
  /** The band your range sits in best, by overlap. */
  band: PayBand | null;
  bandFit: "inside" | "below" | "above" | "overlaps" | "no_band";
  /** What applicants with a stated expectation ask for, in rupees. */
  asks: { count: number; median: number | null; low: number | null; high: number | null };
  /** Share of those asks that fit your range. */
  withinRange: number | null;
}

export function readPay(
  range: { min: number | null; max: number | null },
  bands: PayBand[],
  expectedLpa: (number | null | undefined)[],
): PayRead {
  const min = range.min ?? 0;
  const max = range.max ?? 0;
  let band: PayBand | null = null;
  let best = -1;
  for (const b of bands) {
    const overlap = Math.min(max, b.max_amount) - Math.max(min, b.min_amount);
    if (overlap > best) {
      best = overlap;
      band = b;
    }
  }
  let bandFit: PayRead["bandFit"] = "no_band";
  if (band && max > 0) {
    if (min >= band.min_amount && max <= band.max_amount) bandFit = "inside";
    else if (max < band.min_amount) bandFit = "below";
    else if (min > band.max_amount) bandFit = "above";
    else bandFit = "overlaps";
  }
  const asks = expectedLpa
    .filter((x): x is number => typeof x === "number" && x > 0 && x < 1000)
    .map((x) => x * 100_000)
    .sort((a, b) => a - b);
  const within =
    asks.length && max > 0
      ? Math.round((asks.filter((a) => a >= min && a <= max).length / asks.length) * 100)
      : null;
  return {
    band: bandFit === "no_band" ? null : band,
    bandFit,
    asks: {
      count: asks.length,
      median: median(asks),
      low: asks.length ? asks[Math.floor(asks.length * 0.25)] : null,
      high: asks.length ? asks[Math.min(asks.length - 1, Math.floor(asks.length * 0.75))] : null,
    },
    withinRange: within,
  };
}

/* ---------------- market: ranking ---------------- */

/** Ranking claims start at 25 scored candidates (same rule as the score engine). */
export const RANKING_MIN_POOL = 25;

export function rankingSpread(labels: (string | null | undefined)[]): {
  label: string;
  count: number;
}[] {
  const order = ["Top 5%", "Top 10%", "Top 25%", "Above Average", "Average", "Below Average"];
  const counts = new Map<string, number>();
  for (const l of labels) {
    if (!l) continue;
    const key = order.find((o) => l.startsWith(o)) ?? null;
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return order.filter((o) => counts.has(o)).map((o) => ({ label: o, count: counts.get(o)! }));
}

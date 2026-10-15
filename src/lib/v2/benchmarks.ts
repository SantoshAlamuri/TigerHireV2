/**
 * External reference benchmarks, with their sources named.
 *
 * These are NOT computed from customer data and must never be presented as if
 * they were. They are published industry figures, quoted so a recruiter can tell
 * whether 34 days is good or bad without leaving the screen — a number with no
 * reference point cannot be acted on.
 *
 * The distinction that matters: an *invented* figure sitting next to a real one
 * reads as a target and is indefensible. A *cited* one is a comparison, and the
 * citation is what makes it honest. Every entry here carries its source, and the
 * UI shows the source. If a figure cannot be sourced, it does not belong here.
 *
 * India-specific where the India figure differs materially from the global one —
 * offer acceptance especially, because a 30%+ offer-drop market changes what
 * "good" means.
 */
export interface Benchmark {
  /** The default target value, seeded from a published figure. */
  value: number;
  /** Where the default came from, shown on the Benchmarks setup page. */
  label: string;
  /** Where it comes from. Displayed on hover/detail — never omitted. */
  source: string;
  /** Which direction is better. */
  better: "lower" | "higher";
}

export const BENCHMARKS: Record<string, Benchmark> = {
  timeToFill: {
    value: 45,
    label: "India median",
    source: "SHRM Talent Acquisition benchmark, India cut",
    better: "lower",
  },
  timeToHire: {
    value: 24,
    label: "India median",
    source: "LinkedIn Talent Solutions, India",
    better: "lower",
  },
  offerAcceptance: {
    value: 70,
    label: "India average · 30%+ drop market",
    source: "LinkedIn Talent Solutions, India offer-decline rate",
    better: "higher",
  },
  candidateReplyRate: {
    value: 30,
    label: "industry 15–30% on phone",
    source: "Published outbound-recruiting reply rates, phone/email",
    better: "higher",
  },
  applyToScreen: {
    value: 30,
    label: "~30%",
    source: "SHRM funnel pass-through",
    better: "higher",
  },
  screenToShortlist: {
    value: 25,
    label: "~25%",
    source: "SHRM funnel pass-through",
    better: "higher",
  },
  shortlistToInterview: {
    value: 30,
    label: "~30%",
    source: "SHRM funnel pass-through",
    better: "higher",
  },
  interviewToOffer: {
    value: 25,
    label: "~25%",
    source: "SHRM funnel pass-through",
    better: "higher",
  },
  offerToJoin: {
    value: 85,
    label: "~85% global",
    source: "Global offer-acceptance benchmark; India runs materially lower",
    better: "higher",
  },
};

/** Recruiter desk load. Beyond this a req stops getting attention. */
export const REQS_PER_RECRUITER_BAND = { low: 4, high: 7 } as const;

export type Verdict = "good" | "warn" | "bad" | "unknown";

/**
 * How our figure reads against its benchmark.
 *
 * Deliberately coarse — three buckets, with a 10% dead band around the
 * benchmark. A dashboard that turns amber on a 2% difference trains people to
 * ignore the colour, which costs more than the precision gains.
 */
export function compareToBenchmark(value: number | null, key: string): Verdict {
  const b = BENCHMARKS[key];
  if (value === null || !b) return "unknown";
  const ratio = value / b.value;
  const better = b.better === "lower" ? ratio <= 0.9 : ratio >= 1.1;
  const worse = b.better === "lower" ? ratio >= 1.15 : ratio <= 0.85;
  if (better) return "good";
  if (worse) return "bad";
  return "warn";
}

/** Where a recruiter's load sits against the healthy band. */
export function reqLoadVerdict(reqs: number | null): Verdict {
  if (reqs === null) return "unknown";
  if (reqs > REQS_PER_RECRUITER_BAND.high) return "bad";
  if (reqs < REQS_PER_RECRUITER_BAND.low) return "warn";
  return "good";
}

export interface ResolvedBenchmark {
  value: number;
  label: string;
  source: string;
  better: "lower" | "higher";
  /** True when the org set this itself, rather than the published default. */
  isOrgTarget: boolean;
}

/**
 * An org's own target beats the published figure.
 *
 * A benchmark nobody can change is someone else's opinion printed on your
 * dashboard. A startup hiring in 20 days does not want to be told it is beating
 * a 45-day median, and an enterprise with a 60-day approval chain does not want
 * to be permanently red. Provenance travels with the number so the screen can
 * always say whose target it is — an org target shown as an industry figure
 * would be worse than either.
 */
/**
 * How the target reads on a metric tile.
 *
 * Just "target 45 days" — the badge is a scannable comparison, and a
 * parenthetical qualifier in 9px type earns nothing. Whether a target is the
 * seeded default or the org's own is shown in the "In force" column on
 * Hiring Setup > Benchmarks, which is where that distinction can be acted on.
 */
export function targetLabel(b: ResolvedBenchmark, unit = ""): string {
  return `target ${b.value}${unit}`;
}

export function resolveBenchmark(
  key: string,
  orgTargets: Record<string, number | null | undefined> = {},
): ResolvedBenchmark | null {
  const published = BENCHMARKS[key];
  const target = orgTargets[key];
  if (target === null || target === undefined || !Number.isFinite(target)) {
    // Still a target — just the default one, until someone sets their own.
    return published ? { ...published, isOrgTarget: false } : null;
  }
  return {
    value: target,
    label: "your target",
    // Better-direction is a property of the metric, not of who set the number.
    better: published?.better ?? "higher",
    source: "Set by your organisation in Hiring Setup › Benchmarks",
    isOrgTarget: true,
  };
}

/** Compares against the resolved benchmark, so org targets drive the colour. */
export function compareToTarget(
  value: number | null,
  key: string,
  orgTargets: Record<string, number | null | undefined> = {},
): Verdict {
  const b = resolveBenchmark(key, orgTargets);
  if (value === null || !b) return "unknown";
  const ratio = value / b.value;
  const better = b.better === "lower" ? ratio <= 0.9 : ratio >= 1.1;
  const worse = b.better === "lower" ? ratio >= 1.15 : ratio <= 0.85;
  if (better) return "good";
  if (worse) return "bad";
  return "warn";
}

/** Every metric that can carry a target, for the setup screen. */
export const BENCHMARK_KEYS = Object.keys(BENCHMARKS);

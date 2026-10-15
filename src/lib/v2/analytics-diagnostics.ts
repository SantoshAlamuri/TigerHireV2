/**
 * The By-job and Quality views.
 *
 * Two rules the design's column names invite breaking:
 *
 * "Benchmark" — the obvious reading is an industry pass-through figure. There
 * is no licensed benchmark dataset behind this product, so any number printed
 * there would be invented, and it would be invented next to the org's real
 * number where it reads as a target. The comparison is the org's own median
 * across its jobs, and the label says so.
 *
 * "Clear rubric" — unknown is not the same as absent. A job whose rubric state
 * was never fetched must read as unchecked, not as failing.
 */
const DAY = 86_400_000;

export interface DiagRow {
  jobId: string;
  jobTitle: string;
  jobCreatedAt: string | null;
  status: string;
  source: string | null;
  hasRubric: boolean | null;
}

export interface JobDiagnostic {
  jobId: string;
  jobTitle: string;
  daysOpen: number | null;
  applicants: number;
  clearRubric: boolean | null;
  applyToInterview: number | null;
  bestSource: string | null;
  diagnosis: string;
}

const MOVED = new Set(["shortlisted", "interviewed", "offered", "hired"]);

export function jobDiagnostics(rows: DiagRow[], now: number): JobDiagnostic[] {
  const byJob = new Map<string, DiagRow[]>();
  for (const r of rows) {
    const list = byJob.get(r.jobId);
    if (list) list.push(r);
    else byJob.set(r.jobId, [r]);
  }

  return [...byJob.entries()].map(([jobId, group]) => {
    const first = group[0];
    const opened = first.jobCreatedAt ? Date.parse(first.jobCreatedAt) : NaN;
    const daysOpen = Number.isNaN(opened) ? null : Math.round((now - opened) / DAY);
    const moved = group.filter((r) => MOVED.has(r.status)).length;
    const applyToInterview = group.length ? Math.round((moved / group.length) * 100) : null;

    // Hires name the best source; with no hires yet, volume is the only signal
    // available, and it is a weaker one.
    const hires = new Map<string, number>();
    const volume = new Map<string, number>();
    for (const r of group) {
      const s = r.source ?? "unknown";
      volume.set(s, (volume.get(s) ?? 0) + 1);
      if (r.status === "hired") hires.set(s, (hires.get(s) ?? 0) + 1);
    }
    const top = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const bestSource = hires.size ? top(hires) : top(volume);

    return {
      jobId,
      jobTitle: first.jobTitle,
      daysOpen,
      applicants: group.length,
      clearRubric: first.hasRubric,
      applyToInterview,
      bestSource,
      diagnosis: diagnose(daysOpen, group.length, moved),
    };
  });
}

function diagnose(daysOpen: number | null, applicants: number, moved: number): string {
  if (daysOpen !== null && daysOpen < 7) return "Too new to judge";
  if (applicants === 0) return "No applicants yet — sourcing has not started";
  if (applicants < 10) return "Too few applicants to choose from — widen sourcing";
  if (moved === 0) return "Applicants are arriving but nobody has reviewed them";
  if (moved / applicants < 0.05) return "Almost everyone is being rejected — check the bar";
  if (daysOpen !== null && daysOpen > 60) return "Open over 60 days — pipeline is not converting";
  return "Moving normally";
}

export interface PassThroughRow {
  stage: string;
  /** This org's share, or null when there is nothing to divide. */
  yours: number | null;
  benchmark: number | null;
  benchmarkLabel: string;
  read: string;
}

export function passThrough(rows: { jobId: string; status: string }[]): PassThroughRow[] {
  const share = (subset: { status: string }[], match: (s: string) => boolean) =>
    subset.length
      ? Math.round((subset.filter((r) => match(r.status)).length / subset.length) * 100)
      : null;

  const jobs = new Map<string, { jobId: string; status: string }[]>();
  for (const r of rows) {
    const list = jobs.get(r.jobId);
    if (list) list.push(r);
    else jobs.set(r.jobId, [r]);
  }

  const medianAcrossJobs = (match: (s: string) => boolean) => {
    const per = [...jobs.values()]
      .map((g) => share(g, match))
      .filter((v): v is number => v !== null);
    if (!per.length) return null;
    const s = per.sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
  };

  const stages: { stage: string; match: (s: string) => boolean; read: string }[] = [
    {
      stage: "Applied → Shortlist",
      match: (s) => MOVED.has(s),
      read: "How selective the first pass is",
    },
    {
      stage: "Applied → Interview",
      match: (s) => s === "interviewed" || s === "offered" || s === "hired",
      read: "How many are worth an interviewer's hour",
    },
    {
      stage: "Applied → Hire",
      match: (s) => s === "hired",
      read: "How many applicants it takes to hire one",
    },
  ];

  return stages.map(({ stage, match, read }) => ({
    stage,
    yours: share(rows, match),
    benchmark: medianAcrossJobs(match),
    // Never an industry figure — there is no benchmark dataset behind this.
    benchmarkLabel: "Your median across your jobs",
    read,
  }));
}

export interface QualityCheck {
  check: string;
  status: "pass" | "fail" | "unknown";
  detail: string;
}

export function qualityChecks(input: {
  hires: number;
  scoredHires: number;
  pulseResponses: number;
  /** null when rubric state was not fetched — which is not the same as zero. */
  rubricJobs: number | null;
  totalJobs: number;
}): QualityCheck[] {
  return [
    {
      check: "Every job scores against a rubric",
      // Three distinct states, and conflating any two of them misleads: no jobs
      // at all, jobs whose rubric state nobody fetched, and jobs actually
      // missing a rubric. Reporting the second as "no jobs to check" says the
      // org is empty; reporting it as zero accuses every job of a gap it may
      // not have.
      status:
        input.totalJobs === 0
          ? "unknown"
          : input.rubricJobs === null
            ? "unknown"
            : input.rubricJobs >= input.totalJobs
              ? "pass"
              : "fail",
      detail:
        input.totalJobs === 0
          ? "No jobs to check yet"
          : input.rubricJobs === null
            ? `Rubric state is not exposed to this screen — ${input.totalJobs} jobs unchecked`
            : `${input.rubricJobs} of ${input.totalJobs} jobs have one`,
    },
    {
      check: "Hires can be traced back to their score",
      status: input.hires === 0 ? "unknown" : input.scoredHires >= input.hires ? "pass" : "fail",
      detail:
        input.hires === 0
          ? "No hires yet — nothing to trace"
          : `${input.scoredHires} of ${input.hires} hires have a stored score`,
    },
    {
      check: "Post-hire outcomes are being collected",
      status: input.pulseResponses > 0 ? "pass" : "unknown",
      detail:
        input.pulseResponses > 0
          ? `${input.pulseResponses} pulse responses`
          : "No 90-day pulse responses yet — quality of hire cannot be measured without them",
    },
    {
      check: "Enough hires to validate the score",
      status: input.hires >= 10 ? "pass" : "unknown",
      detail:
        input.hires >= 10
          ? `${input.hires} hires available`
          : `Needs at least 10 hires to mean anything — ${input.hires} so far`,
    },
  ];
}

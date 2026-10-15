/**
 * What the hiring-manager and agency seats actually see.
 *
 * Both are deliberately narrow. A hiring manager gets about twenty minutes a
 * week, so their screen is what they owe and what is coming — never a triage
 * queue, never setup. An agency needs enough truth to stop emailing the
 * recruiter for updates, and nothing about other agencies, internal notes, or
 * how their candidate compares to anyone else's.
 */
export interface SeatApp {
  id: string;
  candidateId: string;
  candidateName: string;
  jobId: string;
  jobTitle: string;
  status: string;
  score: number | null;
  createdAt: string | null;
  /** Where the application came from, e.g. "agency:<id>". */
  source: string | null;
  rejectionReason: string | null;
}

const DAY_MS = 86_400_000;

function waitingDays(createdAt: string | null, now: number): number {
  if (!createdAt) return 0;
  const ms = Date.parse(createdAt);
  if (Number.isNaN(ms)) return 0;
  return Math.max(0, Math.floor((now - ms) / DAY_MS));
}

export interface HmItem extends SeatApp {
  waitingDays: number;
}

export interface HmJobGroup {
  jobId: string;
  jobTitle: string;
  count: number;
}

export interface HmWork {
  awaitingDecision: HmItem[];
  byJob: HmJobGroup[];
  totalOwed: number;
}

/**
 * Shortlisted means the recruiter has done their part and the ball is now in
 * the hiring manager's court. Anything earlier is triage — not theirs — and
 * anything terminal is finished.
 */
export function hiringManagerWork(apps: SeatApp[], now: number = Date.now()): HmWork {
  const awaiting = apps
    .filter((a) => a.status === "shortlisted")
    .map((a) => ({ ...a, waitingDays: waitingDays(a.createdAt, now) }))
    // Longest wait first: those are the candidates most likely to be gone.
    .sort((x, y) => y.waitingDays - x.waitingDays);

  const groups = new Map<string, HmJobGroup>();
  for (const a of awaiting) {
    const g = groups.get(a.jobId) ?? { jobId: a.jobId, jobTitle: a.jobTitle, count: 0 };
    g.count++;
    groups.set(a.jobId, g);
  }

  return {
    awaitingDecision: awaiting,
    byJob: [...groups.values()].sort((x, y) => y.count - x.count),
    totalOwed: awaiting.length,
  };
}

/**
 * The agency row. Note what is absent: no score, no internal notes, no other
 * agency's candidates. Those omissions are the point, so this shape is
 * constructed field by field rather than spread from the source row.
 */
export interface AgencyRow {
  id: string;
  candidateId: string;
  candidateName: string;
  jobId: string;
  jobTitle: string;
  stage: string;
  waitingDays: number;
  closedReason: string | null;
}

function stageFor(a: SeatApp): string {
  if (a.status === "hired") return "Hired";
  if (a.status === "rejected") return "Not selected";
  if (a.status === "withdrawn") return "Withdrawn";
  if (a.status === "shortlisted") return "Shortlisted";
  // Unscored and still at apply stage means the CV is held until the candidate
  // answers screening. That state is invisible today, which is why agencies
  // email the recruiter instead of chasing their own candidate.
  if (a.status === "applied" && (a.score === null || a.score === 0)) {
    return "Awaiting screening answers";
  }
  return "In review";
}

export function agencyView(
  apps: SeatApp[],
  agencySource: string,
  now: number = Date.now(),
): AgencyRow[] {
  return apps
    .filter((a) => Boolean(a.source) && a.source === agencySource)
    .map((a) => ({
      id: a.id,
      candidateId: a.candidateId,
      candidateName: a.candidateName,
      jobId: a.jobId,
      jobTitle: a.jobTitle,
      stage: stageFor(a),
      waitingDays: waitingDays(a.createdAt, now),
      closedReason: a.status === "rejected" ? a.rejectionReason : null,
    }));
}

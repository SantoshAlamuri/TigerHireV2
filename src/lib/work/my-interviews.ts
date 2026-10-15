/**
 * "Your interviews": the week ahead and the scorecards still owed.
 *
 * Interviewers read their own assignments (/api/interviewer/interviews);
 * recruiters, leadership and hiring managers read the booked slots across the
 * jobs they can see (/api/interviews/aggregate). Both become one shape here.
 */

export interface AssignedRow {
  pipelineCandidateId: string;
  jobId: string;
  candidateName: string;
  jobTitle: string;
  stageName: string;
  scheduledAt: string;
  feedbackSubmitted: boolean;
  resumeUrl?: string | null;
  jdSummary?: string | null;
  screeningAnswers?: { question: string; answer: string }[];
}

export interface AggregateRow {
  slotId: string;
  pipelineCandidateId: string;
  jobId: string;
  jobTitle: string;
  candidateName: string;
  scheduledStart: string;
  scheduledEnd: string;
  stageName: string;
  interviewerName: string | null;
  interviewerEmail: string | null;
  interviewerUserId: string | null;
  feedbackSubmitted: boolean;
  aggregateStatus: "upcoming" | "pending_feedback" | "completed" | "cancelled";
}

export interface Interview {
  key: string;
  pipelineCandidateId: string;
  jobId: string;
  candidate: string;
  job: string;
  stage: string;
  start: string;
  end: string | null;
  interviewer: string | null;
  /** Whether the person looking can file the scorecard themselves. */
  mine: boolean;
  feedbackIn: boolean;
  cancelled: boolean;
  resumeUrl: string | null;
  jdSummary: string | null;
  answers: { question: string; answer: string }[];
}

export function fromAssigned(rows: AssignedRow[]): Interview[] {
  return rows.map((r) => ({
    key: `${r.pipelineCandidateId}-${r.scheduledAt}`,
    pipelineCandidateId: r.pipelineCandidateId,
    jobId: r.jobId,
    candidate: r.candidateName,
    job: r.jobTitle,
    stage: r.stageName,
    start: r.scheduledAt,
    end: null,
    interviewer: null,
    mine: true,
    feedbackIn: r.feedbackSubmitted,
    cancelled: false,
    resumeUrl: r.resumeUrl ?? null,
    jdSummary: r.jdSummary ?? null,
    answers: r.screeningAnswers ?? [],
  }));
}

export function fromAggregate(rows: AggregateRow[], userId: string | undefined): Interview[] {
  return rows.map((r) => ({
    key: r.slotId,
    pipelineCandidateId: r.pipelineCandidateId,
    jobId: r.jobId,
    candidate: r.candidateName,
    job: r.jobTitle,
    stage: r.stageName,
    start: r.scheduledStart,
    end: r.scheduledEnd,
    interviewer: r.interviewerName ?? r.interviewerEmail,
    mine: !!userId && r.interviewerUserId === userId,
    feedbackIn: r.feedbackSubmitted,
    cancelled: r.aggregateStatus === "cancelled",
    resumeUrl: null,
    jdSummary: null,
    answers: [],
  }));
}

export interface WeekView {
  /** Done, no scorecard yet, oldest first. */
  owed: Interview[];
  days: { key: string; label: string; items: Interview[] }[];
  upcoming: number;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Split into scorecards owed and the days ahead, labelled Today and Tomorrow where true. */
export function weekView(list: Interview[], now = new Date()): WeekView {
  const live = list.filter((i) => !i.cancelled);
  const owed = live
    .filter((i) => new Date(i.start) < now && !i.feedbackIn)
    .sort((a, b) => a.start.localeCompare(b.start));
  const ahead = live
    .filter((i) => new Date(i.end ?? i.start) >= now)
    .sort((a, b) => a.start.localeCompare(b.start));

  const today = dayKey(now);
  const tmr = new Date(now);
  tmr.setDate(now.getDate() + 1);
  const tomorrow = dayKey(tmr);
  const fmt = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
  });

  const days = new Map<string, { key: string; label: string; items: Interview[] }>();
  for (const i of ahead) {
    const d = new Date(i.start);
    const k = dayKey(d);
    const label = k === today ? "Today" : k === tomorrow ? "Tomorrow" : fmt.format(d);
    const g = days.get(k) ?? { key: k, label, items: [] };
    g.items.push(i);
    days.set(k, g);
  }
  return { owed, days: [...days.values()], upcoming: ahead.length };
}

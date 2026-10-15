/**
 * The work queue: every job, sorted by whether it needs the person now.
 *
 * Uses the same reading of the data as the journey (see journey.ts) but from
 * the cheap list endpoints, so the queue can show every job without loading
 * each one in full. Opening a job runs the full journey.
 */
import type { JobApplicantCounts } from "@/lib/v2/ta-portfolio";

export type QueueTone = "you" | "bad" | "moving" | "calm";

/** What kind of thing is waiting, so home can group like with like. */
export type QueueKind =
  | "no_rubric"
  | "rubric"
  | "review"
  | "publish"
  | "scoring"
  | "collecting"
  | "calm";

export interface QueueJobInput {
  id: string;
  title: string;
  status: "draft" | "open";
  rubricApproved: boolean;
  counts: JobApplicantCounts | null;
}

export interface QueueEntry {
  id: string;
  title: string;
  tone: QueueTone;
  kind: QueueKind;
  /** How many candidates are behind this entry, where that's the point. */
  count?: number;
  /** What is happening, in a few words. */
  line: string;
  /** Lower sorts first. */
  rank: number;
}

const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

export function queueEntry(j: QueueJobInput): QueueEntry {
  const c = j.counts;
  if (j.status === "draft")
    return {
      id: j.id,
      title: j.title,
      tone: "you",
      kind: "publish",
      line: "Finish setup and publish",
      rank: 2,
    };
  if (!j.rubricApproved && c && c.applicants > 0)
    return {
      id: j.id,
      title: j.title,
      tone: "bad",
      kind: "no_rubric",
      count: c.applicants,
      line: `${n(c.applicants, "applicant")} without a rubric`,
      rank: 0,
    };
  if (!j.rubricApproved)
    return {
      id: j.id,
      title: j.title,
      tone: "you",
      kind: "rubric",
      line: "Approve the rubric",
      rank: 1,
    };
  if (c && c.awaitingReview > 0)
    return {
      id: j.id,
      title: j.title,
      tone: "you",
      kind: "review",
      count: c.awaitingReview,
      line: `${n(c.awaitingReview, "candidate")} to review`,
      rank: 1,
    };
  if (c && c.unscored > 0)
    return {
      id: j.id,
      title: j.title,
      tone: "moving",
      kind: "scoring",
      count: c.unscored,
      line: `Agent scoring ${c.unscored}`,
      rank: 3,
    };
  if (!c || c.applicants === 0)
    return {
      id: j.id,
      title: j.title,
      tone: "moving",
      kind: "collecting",
      line: "Collecting applications",
      rank: 4,
    };
  return {
    id: j.id,
    title: j.title,
    tone: "calm",
    kind: "calm",
    line: "Nothing waiting on you",
    rank: 5,
  };
}

export function buildQueue(jobs: QueueJobInput[]): {
  needsYou: QueueEntry[];
  moving: QueueEntry[];
} {
  const all = jobs
    .map(queueEntry)
    .sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));
  return {
    needsYou: all.filter((e) => e.tone === "you" || e.tone === "bad"),
    moving: all.filter((e) => e.tone === "moving" || e.tone === "calm"),
  };
}

export interface QueueGroup {
  kind: QueueKind;
  title: string;
  /** One line on the whole group, e.g. "62 candidates across 5 jobs". */
  summary: string;
  tone: QueueTone;
  entries: QueueEntry[];
}

const GROUPS: { kind: QueueKind; title: string }[] = [
  { kind: "no_rubric", title: "Applicants waiting on a rubric" },
  { kind: "review", title: "Candidates to review" },
  { kind: "rubric", title: "Rubrics to approve" },
  { kind: "publish", title: "Ready to finish and publish" },
];

/** What needs you, grouped by the kind of work, most urgent group first. */
export function groupNeedsYou(entries: QueueEntry[]): QueueGroup[] {
  return GROUPS.map(({ kind, title }) => {
    const list = entries.filter((e) => e.kind === kind);
    const people = list.reduce((sum, e) => sum + (e.count ?? 0), 0);
    const jobs = n(list.length, "job");
    const summary =
      kind === "review"
        ? `${n(people, "candidate")} across ${jobs}`
        : kind === "no_rubric"
          ? `${n(people, "applicant")} across ${jobs}`
          : jobs;
    return { kind, title, summary, tone: list[0]?.tone ?? "you", entries: list };
  }).filter((g) => g.entries.length > 0);
}

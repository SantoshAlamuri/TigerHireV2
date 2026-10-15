/**
 * The work queue: every job, sorted by whether it needs the person now.
 *
 * Uses the same reading of the data as the journey (see journey.ts) but from
 * the cheap list endpoints, so the queue can show every job without loading
 * each one in full. Opening a job runs the full journey.
 */
import type { JobApplicantCounts } from "@/lib/v2/ta-portfolio";

export type QueueTone = "you" | "bad" | "moving" | "calm";

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
  /** What is happening, in a few words. */
  line: string;
  /** Lower sorts first. */
  rank: number;
}

const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

export function queueEntry(j: QueueJobInput): QueueEntry {
  const c = j.counts;
  if (j.status === "draft")
    return { id: j.id, title: j.title, tone: "you", line: "Finish setup and publish", rank: 2 };
  if (!j.rubricApproved && c && c.applicants > 0)
    return {
      id: j.id,
      title: j.title,
      tone: "bad",
      line: `${n(c.applicants, "applicant")} without a rubric`,
      rank: 0,
    };
  if (!j.rubricApproved)
    return { id: j.id, title: j.title, tone: "you", line: "Approve the rubric", rank: 1 };
  if (c && c.awaitingReview > 0)
    return {
      id: j.id,
      title: j.title,
      tone: "you",
      line: `${n(c.awaitingReview, "candidate")} to review`,
      rank: 1,
    };
  if (c && c.unscored > 0)
    return {
      id: j.id,
      title: j.title,
      tone: "moving",
      line: `Agent scoring ${c.unscored}`,
      rank: 3,
    };
  if (!c || c.applicants === 0)
    return { id: j.id, title: j.title, tone: "moving", line: "Collecting applications", rank: 4 };
  return { id: j.id, title: j.title, tone: "calm", line: "Nothing waiting on you", rank: 5 };
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

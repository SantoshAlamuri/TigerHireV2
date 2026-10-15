/**
 * The job journey: where a job's work is, who holds it, and where to take the
 * person who opens it.
 *
 * The work-driven UI never asks a recruiter to find the right screen. Opening a
 * job lands on the first stage that needs a human; stages the agent or
 * automation is handling show what they are doing and step aside. This module
 * is that decision, kept pure so it is stated once and tested once.
 *
 * Every status is derived from data. Nothing here is a flag someone sets.
 */

/** Who does the work at a stage. "auto" is deterministic rules, no AI. */
export type Actor = "agent" | "auto" | "you";

export type StageKey =
  | "request"
  | "description"
  | "rubric"
  | "publish"
  | "applications"
  | "scoring"
  | "review"
  | "interviews"
  | "offer";

/**
 * - done: nothing left to do here.
 * - working: the agent or automation is on it; no human needed.
 * - needs_you: the person viewing owes an action.
 * - waiting: an earlier stage has to finish first, or someone else holds it.
 * - blocked: something is wrong and results downstream cannot be trusted.
 * - skipped: does not apply to this job.
 */
export type StageStatus = "done" | "working" | "needs_you" | "waiting" | "blocked" | "skipped";

export interface JourneyFacts {
  hiringRequestId?: string | null;
  hiringRequestStatus?: string | null;
  jdPublished: boolean;
  rubricApproved: boolean;
  /** The organisation has role-specific scoring switched off. */
  rubricNotRequired: boolean;
  mustHaveCount: number;
  roleOpen: boolean;
  publicApplications: boolean;
  screeningQuestionCount: number;
  applicants: number;
  /** Applied but carrying no score — a silent drop if left alone. */
  unscored: number;
  /** A human still owes these applicants a decision. */
  awaitingReview: number;
  shortlisted: number;
  hired: number;
  interviewsUpcoming: number;
  /** Interviews that happened with no scorecard yet. */
  interviewsAwaitingFeedback: number;
  offersOut: number;
  /** Offers the offer-state rules flag as needing a nudge or a decision. */
  offersNeedingAction: number;
  offersSigned: number;
}

export interface JourneyStage {
  key: StageKey;
  label: string;
  actors: Actor[];
  status: StageStatus;
  /** One line, written for the person looking at it. */
  headline: string;
}

export interface Journey {
  stages: JourneyStage[];
  /** Where to take the person who opens the job. */
  currentKey: StageKey;
  /** How many stages are waiting on the person right now. */
  needsYouCount: number;
  /** True when every applicable stage is done. */
  complete: boolean;
}

export const STAGE_ORDER: StageKey[] = [
  "request",
  "description",
  "rubric",
  "publish",
  "applications",
  "scoring",
  "review",
  "interviews",
  "offer",
];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function requestStage(f: JourneyFacts): JourneyStage {
  const base = { key: "request" as const, label: "Request", actors: ["you"] as Actor[] };
  if (!f.hiringRequestId)
    return { ...base, status: "skipped", headline: "Created without a request" };
  const s = (f.hiringRequestStatus ?? "").toLowerCase();
  if (["approved", "converted", "closed", "filled"].includes(s))
    return { ...base, status: "done", headline: "Request approved" };
  if (s === "rejected") return { ...base, status: "blocked", headline: "Request was rejected" };
  if (["draft", "changes_requested", "returned"].includes(s))
    return {
      ...base,
      status: "needs_you",
      headline: "Finish the request and send it for approval",
    };
  return { ...base, status: "waiting", headline: "Waiting for approval" };
}

export function buildJourney(f: JourneyFacts): Journey {
  const stages: JourneyStage[] = [];
  stages.push(requestStage(f));

  stages.push({
    key: "description",
    label: "Job description",
    actors: ["agent", "you"],
    status: f.jdPublished ? "done" : "needs_you",
    headline: f.jdPublished ? "Description is ready" : "Check the draft and save it",
  });

  const rubricDone = f.rubricNotRequired || f.rubricApproved;
  stages.push({
    key: "rubric",
    label: "Rubric",
    actors: ["agent", "you"],
    status: f.rubricNotRequired ? "skipped" : f.rubricApproved ? "done" : "needs_you",
    headline: f.rubricNotRequired
      ? "Role-specific scoring is off for your organisation"
      : f.rubricApproved
        ? `Approved, ${plural(f.mustHaveCount, "must-have")}`
        : f.mustHaveCount > 0
          ? "Review the rubric and approve it"
          : "Set the must-haves the agent scores against",
  });

  const readyToPublish = f.jdPublished && rubricDone;
  stages.push({
    key: "publish",
    label: "Publish",
    actors: ["auto", "you"],
    status: f.roleOpen ? "done" : readyToPublish ? "needs_you" : "waiting",
    headline: f.roleOpen
      ? f.publicApplications
        ? "Live on your careers page"
        : "Open for internal applications"
      : readyToPublish
        ? "Ready to go live"
        : "Opens once the description and rubric are done",
  });

  stages.push({
    key: "applications",
    label: "Applications",
    actors: ["auto"],
    status: !f.roleOpen && f.applicants === 0 ? "waiting" : f.applicants > 0 ? "done" : "working",
    headline:
      f.applicants > 0
        ? `${plural(f.applicants, "application")} in${f.screeningQuestionCount ? `, ${plural(f.screeningQuestionCount, "screening question")} asked` : ""}`
        : f.roleOpen
          ? "Live and collecting applications"
          : "Starts when the job goes live",
  });

  let scoring: Pick<JourneyStage, "status" | "headline">;
  if (f.applicants === 0) scoring = { status: "waiting", headline: "Nothing to score yet" };
  else if (!rubricDone)
    scoring = {
      status: "blocked",
      headline: `${plural(f.applicants, "applicant")} scored without a role rubric`,
    };
  else if (f.unscored > 0)
    scoring = { status: "working", headline: `Scoring ${plural(f.unscored, "applicant")}` };
  else
    scoring = {
      status: "done",
      headline: `All ${plural(f.applicants, "applicant")} scored with evidence`,
    };
  stages.push({ key: "scoring", label: "Scoring", actors: ["agent", "auto"], ...scoring });

  stages.push({
    key: "review",
    label: "Your review",
    actors: ["you"],
    status: f.awaitingReview > 0 ? "needs_you" : f.applicants > 0 ? "done" : "waiting",
    headline:
      f.awaitingReview > 0
        ? `${plural(f.awaitingReview, "candidate")} waiting for your decision`
        : f.applicants > 0
          ? `Queue clear, ${f.shortlisted} shortlisted`
          : "Candidates appear here once scored",
  });

  let interviews: Pick<JourneyStage, "status" | "headline">;
  if (f.interviewsAwaitingFeedback > 0)
    interviews = {
      status: "needs_you",
      headline: `${plural(f.interviewsAwaitingFeedback, "scorecard")} still owed`,
    };
  else if (f.interviewsUpcoming > 0)
    interviews = {
      status: "working",
      headline: `${plural(f.interviewsUpcoming, "interview")} booked`,
    };
  else if (f.shortlisted > 0 && f.offersOut === 0 && f.hired === 0)
    interviews = {
      status: "needs_you",
      headline: `${plural(f.shortlisted, "shortlisted candidate")} to schedule`,
    };
  else if (f.offersOut > 0 || f.hired > 0)
    interviews = { status: "done", headline: "Interviews complete" };
  else interviews = { status: "waiting", headline: "Starts when you shortlist someone" };
  stages.push({ key: "interviews", label: "Interviews", actors: ["auto", "you"], ...interviews });

  let offer: Pick<JourneyStage, "status" | "headline">;
  if (f.offersNeedingAction > 0)
    offer = {
      status: "needs_you",
      headline: `${plural(f.offersNeedingAction, "offer")} need a nudge`,
    };
  else if (f.hired > 0 || f.offersSigned > 0)
    offer = {
      status: "done",
      headline: `${plural(Math.max(f.hired, f.offersSigned), "offer")} signed`,
    };
  else if (f.offersOut > 0)
    offer = { status: "working", headline: `${plural(f.offersOut, "offer")} out` };
  else offer = { status: "waiting", headline: "No offers yet" };
  stages.push({ key: "offer", label: "Offer", actors: ["you"], ...offer });

  return {
    stages,
    currentKey: pickCurrent(stages),
    needsYouCount: stages.filter((s) => s.status === "needs_you" || s.status === "blocked").length,
    complete: stages.every((s) => s.status === "done" || s.status === "skipped"),
  };
}

/**
 * Where to take the person: the earliest stage that needs a human (a block
 * outranks nothing — it is a stage that needs a human), then the earliest
 * stage the system is working on, then the first stage still waiting, then
 * the last stage.
 */
export function pickCurrent(stages: JourneyStage[]): StageKey {
  const first = (pred: (s: JourneyStage) => boolean) => stages.find(pred)?.key;
  return (
    first((s) => s.status === "needs_you" || s.status === "blocked") ??
    first((s) => s.status === "working") ??
    first((s) => s.status === "waiting") ??
    stages[stages.length - 1].key
  );
}

/** The stage after `key` that the journey would take the person to next. */
export function nextStop(journey: Journey, key: StageKey): StageKey | null {
  const i = STAGE_ORDER.indexOf(key);
  const later = journey.stages.filter((s) => STAGE_ORDER.indexOf(s.key) > i);
  const hit =
    later.find((s) => s.status === "needs_you" || s.status === "blocked") ??
    later.find((s) => s.status === "working");
  return hit?.key ?? null;
}

export function isStageKey(v: unknown): v is StageKey {
  return typeof v === "string" && (STAGE_ORDER as string[]).includes(v);
}

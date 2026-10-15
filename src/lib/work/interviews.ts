/**
 * The interviews step: "Who needs an interview, and who owes feedback?"
 *
 * Pure logic only. The block reads five existing endpoints and this module
 * turns them into three lists, most urgent first:
 *
 *   1. Scorecards owed — the interview has ended and nobody has filed feedback.
 *   2. To schedule     — shortlisted, in the pipeline, with nothing booked.
 *   3. Booked          — upcoming interviews.
 *
 * Rules mirror the backend so the lists never disagree with it:
 * - "Owed" is /api/interviews/aggregate's `pending_feedback` (ended, no outcome,
 *   no feedback row). A no-show is "cancelled" there and owes nothing.
 * - A pipeline row counts as booked if ANY booked slot carries its id, which is
 *   the same check the book route's atomic RPC makes
 *   ("Candidate already has a booked slot").
 * - Only `shortlisted` and `in_progress` pipeline rows are still in play
 *   (see supabase/schema/20_pipeline.sql: shortlisted | in_progress | hired | rejected).
 * - An interview round needs an interviewer when it is typed `interview` and has
 *   neither an internal profile nor an external email AND name
 *   (`hasInterviewerAssignment`, the same rule pipeline-stages enforces).
 */

import { hasInterviewerAssignment, isInterviewLikeStage } from "@/lib/pipeline/stage-interviewer";

/* ---------- shapes of the endpoints we read ---------- */

/** One row of GET /api/interviews/aggregate. */
export interface AggregateInterview {
  slotId: string;
  pipelineCandidateId: string;
  candidateName?: string | null;
  candidateEmail?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  stageName?: string | null;
  interviewerName?: string | null;
  interviewerEmail?: string | null;
  feedbackSubmitted?: boolean;
  aggregateStatus?: "upcoming" | "pending_feedback" | "completed" | "cancelled" | string | null;
}

/** One row of GET /api/jobs/[id]/availability. */
export interface AvailabilitySlot {
  id: string;
  start_at: string;
  end_at: string;
  status?: string | null;
  pipeline_candidate_id?: string | null;
  user_id?: string | null;
  slot_owner?: { id: string; display_name: string | null } | null;
  candidate_email_status?: string | null;
  interviewer_email_status?: string | null;
  candidate_whatsapp_status?: string | null;
}

/** One row of GET /api/jobs/[id]/pipeline/approve. */
export interface PipelineRow {
  id: string;
  candidate_id?: string | null;
  status?: string | null;
  stage_id?: string | null;
  created_at?: string | null;
  candidates?: { id?: string; name?: string | null; email?: string | null } | null;
}

/** One row of GET /api/jobs/[id]/pipeline-stages. */
export interface StageRow {
  id: string;
  job_id?: string;
  stage_name: string;
  stage_order: number;
  stage_type?: string | null;
  sla_days?: number | null;
  is_locked?: boolean;
  notify_candidate?: boolean;
  color?: string | null;
  notify_email_body?: string | null;
  interviewer_user_id?: string | null;
  interviewer_email?: string | null;
  interviewer_name?: string | null;
  feedback_template_id?: string | null;
  interviewer?: { user_id: string; full_name: string | null; email: string | null } | null;
}

/* ---------- what the block shows ---------- */

export interface OwedScorecard {
  slotId: string;
  pipelineCandidateId: string;
  candidateName: string;
  endedAt: string;
  stageName: string;
  interviewer: string | null;
  /** Automation nudges the interviewer 24 hours after the interview ends. */
  reminded: boolean;
}

export interface ToSchedule {
  pipelineCandidateId: string;
  candidateName: string;
  candidateEmail: string | null;
  stageId: string | null;
  stageName: string;
  interviewer: string | null;
  /** This round is an interview round with nobody assigned to run it. */
  needsInterviewer: boolean;
}

export interface BookedInterview {
  slotId: string;
  pipelineCandidateId: string;
  candidateName: string;
  start: string;
  end: string | null;
  stageName: string;
  interviewer: string | null;
  /** Names of invite channels that failed, from the slot's delivery columns. */
  failedInvites: string[];
}

export interface OpenSlot {
  id: string;
  start: string;
  end: string;
  owner: string | null;
}

export interface InterviewBoard {
  owed: OwedScorecard[];
  toSchedule: ToSchedule[];
  booked: BookedInterview[];
  openSlots: OpenSlot[];
  /** Interview rounds that block scheduling until someone is named to run them. */
  stagesMissingInterviewer: StageRow[];
}

export const ACTIVE_PIPELINE_STATUSES = ["shortlisted", "in_progress"] as const;

/** Automation's feedback nudge runs this long after an interview ends. */
export const FEEDBACK_NUDGE_AFTER_MS = 24 * 60 * 60 * 1000;

const ms = (iso: string | null | undefined): number => {
  if (!iso) return Number.NaN;
  return Date.parse(iso);
};

const clean = (s: string | null | undefined): string | null => {
  const t = (s ?? "").trim();
  return t.length ? t : null;
};

/** Who runs a round, in words, or null when nobody is assigned. */
export function interviewerLabel(stage: StageRow | null | undefined): string | null {
  if (!stage) return null;
  return (
    clean(stage.interviewer?.full_name) ??
    clean(stage.interviewer_name) ??
    clean(stage.interviewer?.email) ??
    clean(stage.interviewer_email)
  );
}

export function stageNeedsInterviewer(stage: StageRow | null | undefined): boolean {
  if (!stage) return false;
  return (
    isInterviewLikeStage(stage.stage_type) &&
    !hasInterviewerAssignment({
      interviewer_user_id: stage.interviewer_user_id,
      interviewer_email: stage.interviewer_email,
      interviewer_name: stage.interviewer_name,
    })
  );
}

function failedInviteLabels(slot: AvailabilitySlot | undefined): string[] {
  if (!slot) return [];
  const out: string[] = [];
  if (slot.candidate_email_status === "failed") out.push("candidate email");
  if (slot.interviewer_email_status === "failed") out.push("interviewer email");
  if (slot.candidate_whatsapp_status === "failed") out.push("candidate WhatsApp");
  return out;
}

/**
 * Turns the endpoints into the three lists. `interviews` is null when the
 * aggregate feed could not be read (for example an agency seat, which it
 * refuses): booked interviews then come from the slots alone, and owed
 * scorecards cannot be known — the caller must say so.
 */
export function buildInterviewBoard(input: {
  interviews: AggregateInterview[] | null;
  slots: AvailabilitySlot[];
  pipeline: PipelineRow[];
  stages: StageRow[];
  now: number;
}): InterviewBoard {
  const { slots, pipeline, stages, now } = input;
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const pcById = new Map(pipeline.map((p) => [p.id, p]));
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const nameOf = (pcId: string, fallback?: string | null) =>
    clean(fallback) ?? clean(pcById.get(pcId)?.candidates?.name) ?? "Candidate";

  const bookedSlots = slots.filter((s) => s.status === "booked" && s.pipeline_candidate_id);
  const bookedPc = new Set<string>(bookedSlots.map((s) => s.pipeline_candidate_id as string));

  const owed: OwedScorecard[] = [];
  const booked: BookedInterview[] = [];

  if (input.interviews) {
    for (const iv of input.interviews) {
      bookedPc.add(iv.pipelineCandidateId);
      const start = iv.scheduledStart ?? null;
      if (!start || Number.isNaN(ms(start))) continue;
      const end = iv.scheduledEnd ?? null;
      const stageName = clean(iv.stageName) ?? "Interview";
      const interviewer = clean(iv.interviewerName) ?? clean(iv.interviewerEmail);
      if (iv.aggregateStatus === "pending_feedback") {
        const endedAt = end ?? start;
        owed.push({
          slotId: iv.slotId,
          pipelineCandidateId: iv.pipelineCandidateId,
          candidateName: nameOf(iv.pipelineCandidateId, iv.candidateName),
          endedAt,
          stageName,
          interviewer,
          reminded: now - ms(endedAt) >= FEEDBACK_NUDGE_AFTER_MS,
        });
      } else if (iv.aggregateStatus === "upcoming") {
        booked.push({
          slotId: iv.slotId,
          pipelineCandidateId: iv.pipelineCandidateId,
          candidateName: nameOf(iv.pipelineCandidateId, iv.candidateName),
          start,
          end,
          stageName,
          interviewer,
          failedInvites: failedInviteLabels(slotById.get(iv.slotId)),
        });
      }
    }
  } else {
    // Degraded: slots alone. Only future interviews are shown; past ones are
    // left out rather than guessed as owed or done.
    for (const s of bookedSlots) {
      const end = ms(s.end_at);
      if (!(end > now)) continue;
      const pcId = s.pipeline_candidate_id as string;
      const stage = stageById.get(pcById.get(pcId)?.stage_id ?? "");
      booked.push({
        slotId: s.id,
        pipelineCandidateId: pcId,
        candidateName: nameOf(pcId),
        start: s.start_at,
        end: s.end_at,
        stageName: stage?.stage_name ?? "Interview",
        interviewer: interviewerLabel(stage) ?? clean(s.slot_owner?.display_name),
        failedInvites: failedInviteLabels(s),
      });
    }
  }

  const toSchedule: ToSchedule[] = pipeline
    .filter(
      (p) =>
        (ACTIVE_PIPELINE_STATUSES as readonly string[]).includes(
          (p.status ?? "shortlisted").toLowerCase(),
        ) && !bookedPc.has(p.id),
    )
    .map((p) => {
      const stage = p.stage_id ? stageById.get(p.stage_id) : undefined;
      return {
        pipelineCandidateId: p.id,
        candidateName: clean(p.candidates?.name) ?? "Candidate",
        candidateEmail: clean(p.candidates?.email),
        stageId: stage?.id ?? null,
        stageName: stage?.stage_name ?? "Interview",
        interviewer: interviewerLabel(stage),
        needsInterviewer: stageNeedsInterviewer(stage),
      };
    })
    .sort((a, b) => a.candidateName.localeCompare(b.candidateName));

  const missing = new Map<string, StageRow>();
  for (const t of toSchedule) {
    const st = t.stageId ? stageById.get(t.stageId) : undefined;
    if (st && t.needsInterviewer) missing.set(st.id, st);
  }

  const openSlots: OpenSlot[] = slots
    .filter((s) => s.status === "available" && ms(s.start_at) > now)
    .sort((a, b) => ms(a.start_at) - ms(b.start_at))
    .map((s) => ({
      id: s.id,
      start: s.start_at,
      end: s.end_at,
      owner: clean(s.slot_owner?.display_name),
    }));

  owed.sort((a, b) => ms(a.endedAt) - ms(b.endedAt));
  booked.sort((a, b) => ms(a.start) - ms(b.start));

  return {
    owed,
    toSchedule,
    booked,
    openSlots,
    stagesMissingInterviewer: [...missing.values()].sort((a, b) => a.stage_order - b.stage_order),
  };
}

/**
 * The person has cleared what they owe when no scorecard is waiting and every
 * shortlisted candidate is either booked or has been sent a link to book.
 */
export function isCleared(board: InterviewBoard, linkSent: ReadonlySet<string>): boolean {
  return (
    board.owed.length === 0 && board.toSchedule.every((t) => linkSent.has(t.pipelineCandidateId))
  );
}

/* ---------- words ---------- */

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Tue, 14 Oct, 3:30 pm" in Indian English. */
export function formatWhen(iso: string | null | undefined, timeZone?: string): string {
  const t = ms(iso);
  if (Number.isNaN(t)) return "Time not set";
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(t));
}

/** "Ended 3 hours ago", "Ended yesterday", "Ended 4 days ago". */
export function endedAgo(iso: string, now: number): string {
  const diff = now - ms(iso);
  if (Number.isNaN(diff)) return "Ended";
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "Ended just now";
  if (hours < 24) return `Ended ${plural(hours, "hour")} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Ended yesterday";
  return `Ended ${days} days ago`;
}

/** "In 2 hours", "Tomorrow", "In 5 days", "Now". */
export function startsIn(iso: string, now: number): string {
  const diff = ms(iso) - now;
  if (Number.isNaN(diff)) return "";
  if (diff <= 0) return "Now";
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "Within the hour";
  if (hours < 24) return `In ${plural(hours, "hour")}`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

/** What happened after asking for a self-schedule link, in one line. */
export function linkOutcome(res: {
  emailSent?: boolean;
  emailError?: string;
  emailNotice?: string;
}): {
  ok: boolean;
  text: string;
} {
  if (res.emailSent === false) {
    return { ok: false, text: `Link made, but not emailed: ${res.emailError ?? "unknown reason"}` };
  }
  if (res.emailNotice) return { ok: true, text: `Link emailed. ${res.emailNotice}` };
  return { ok: true, text: "Link emailed. They pick a time and the invite goes out." };
}

/* ---------- scorecards ---------- */

export const RECOMMENDATIONS = [
  { value: "strong_hire", label: "Strong hire" },
  { value: "hire", label: "Hire" },
  { value: "no_hire", label: "No hire" },
  { value: "strong_no_hire", label: "Strong no hire" },
  { value: "cannot_assess", label: "Cannot assess" },
] as const;

export type Recommendation = (typeof RECOMMENDATIONS)[number]["value"];

export interface ScorecardFieldLite {
  label: string;
  type: string;
  required?: boolean;
  scale?: string[];
  options?: string[];
  guidance?: string;
  description?: string;
}

export interface ScorecardForm {
  responses: Record<string, string | number>;
  overallRating: number;
  recommendation: Recommendation | "";
  notes: string;
}

export const EMPTY_SCORECARD: ScorecardForm = {
  responses: {},
  overallRating: 0,
  recommendation: "",
  notes: "",
};

/** The scale a rating-like field renders, or null for stars (1–5) / text. */
export function scaleFor(field: ScorecardFieldLite): string[] | null {
  if (field.type === "yes_no") return ["No", "Yes"];
  if (field.type === "rating" && field.scale && field.scale.length >= 2) return field.scale;
  if (field.type === "rating") return ["1", "2", "3", "4", "5"];
  return null;
}

/**
 * What is still missing before the scorecard can be filed, in the backend's
 * terms: a recommendation always; an overall rating 1–5 unless "cannot
 * assess"; and every required competency.
 */
export function scorecardGaps(fields: ScorecardFieldLite[], form: ScorecardForm): string[] {
  const gaps: string[] = [];
  for (const f of fields) {
    if (!f.required) continue;
    const v = form.responses[f.label];
    if (v === undefined || v === "" || v === 0) gaps.push(f.label);
  }
  if (!form.recommendation) gaps.push("Recommendation");
  if (
    form.recommendation !== "cannot_assess" &&
    !(form.overallRating >= 1 && form.overallRating <= 5)
  )
    gaps.push("Overall rating");
  return gaps;
}

export interface ScorecardDraft {
  fields?: { label: string; value: number | string; evidence?: string }[];
  notes?: string;
}

/**
 * Apply the agent's draft. Competency answers and evidence are pre-filled;
 * the overall rating and recommendation are NEVER seeded — the person sets
 * the verdict (same rule as the classic feedback screen). Empty answers
 * ("not assessed") do not overwrite what the person already chose.
 */
export function applyDraft(
  form: ScorecardForm,
  draft: ScorecardDraft,
): { form: ScorecardForm; evidence: Record<string, string> } {
  const responses = { ...form.responses };
  const evidence: Record<string, string> = {};
  for (const f of draft.fields ?? []) {
    if (f.value === "" || f.value === null || f.value === undefined) continue;
    responses[f.label] = f.value;
    if (f.evidence) evidence[f.label] = f.evidence;
  }
  return {
    form: {
      ...form,
      responses,
      notes: form.notes || draft.notes || "",
    },
    evidence,
  };
}

/** Body for POST /api/jobs/[id]/feedback. */
export function feedbackBody(templateId: string, pipelineCandidateId: string, form: ScorecardForm) {
  return {
    template_id: templateId,
    pipeline_candidate_id: pipelineCandidateId,
    responses: form.responses,
    ...(form.recommendation === "cannot_assess" && !form.overallRating
      ? {}
      : { overall_rating: form.overallRating }),
    recommendation: form.recommendation,
    ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
  };
}

/**
 * Body for POST /api/jobs/[id]/pipeline-stages that names an interviewer for
 * one round. The route rewrites every column of a row it updates and defaults
 * the ones it is not sent, so the row's other settings are carried over as
 * they are.
 */
export function stageWithInterviewer(
  stage: StageRow,
  who: { userId: string } | { name: string; email: string },
) {
  const base = {
    id: stage.id,
    stage_name: stage.stage_name,
    stage_order: stage.stage_order,
    ...(stage.stage_type ? { stage_type: stage.stage_type } : {}),
    sla_days: stage.sla_days ?? null,
    is_locked: stage.is_locked ?? false,
    notify_candidate: stage.notify_candidate ?? false,
    ...(stage.color ? { color: stage.color } : {}),
    notify_email_body: stage.notify_email_body ?? null,
    feedback_template_id: stage.feedback_template_id ?? null,
  };
  if ("userId" in who) {
    return {
      stages: [
        {
          ...base,
          interviewer_user_id: who.userId,
          interviewer_email: null,
          interviewer_name: null,
        },
      ],
    };
  }
  return {
    stages: [
      {
        ...base,
        interviewer_user_id: null,
        interviewer_email: who.email.trim().toLowerCase(),
        interviewer_name: who.name.trim(),
      },
    ],
  };
}

/* ---------- opening times ---------- */

export interface DeclaredWindow {
  starts_at: string;
  ends_at: string;
}

/**
 * Hour-long slots from the windows interviewers declared, future ones only —
 * the same split the classic screen uses before POSTing to availability.
 */
export function slotsFromWindows(
  windows: DeclaredWindow[],
  now: number,
  minutes = 60,
): { start_at: string; end_at: string }[] {
  const step = minutes * 60_000;
  const out: { start_at: string; end_at: string }[] = [];
  for (const w of windows) {
    const end = ms(w.ends_at);
    let cursor = Math.max(ms(w.starts_at), now);
    if (Number.isNaN(cursor) || Number.isNaN(end)) continue;
    // Start on a whole step from the window's start so slots line up.
    const start = ms(w.starts_at);
    if (cursor > start) cursor = start + Math.ceil((cursor - start) / step) * step;
    while (cursor + step <= end) {
      out.push({
        start_at: new Date(cursor).toISOString(),
        end_at: new Date(cursor + step).toISOString(),
      });
      cursor += step;
    }
  }
  return out;
}

/**
 * One slot from a `datetime-local` value (read in the browser's time zone).
 * Null when empty, unreadable or not in the future — the backend refuses past
 * starts.
 */
export function slotFromLocalInput(
  value: string,
  minutes: number,
  now: number,
): { start_at: string; end_at: string } | null {
  if (!value) return null;
  const start = new Date(value).getTime();
  if (Number.isNaN(start) || start <= now || !(minutes > 0)) return null;
  return {
    start_at: new Date(start).toISOString(),
    end_at: new Date(start + minutes * 60_000).toISOString(),
  };
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

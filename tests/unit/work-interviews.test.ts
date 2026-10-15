import { describe, expect, it } from "vitest";
import {
  EMPTY_SCORECARD,
  applyDraft,
  buildInterviewBoard,
  endedAgo,
  feedbackBody,
  formatWhen,
  interviewerLabel,
  isCleared,
  linkOutcome,
  scaleFor,
  scorecardGaps,
  slotFromLocalInput,
  slotsFromWindows,
  stageNeedsInterviewer,
  stageWithInterviewer,
  startsIn,
  type AggregateInterview,
  type AvailabilitySlot,
  type PipelineRow,
  type StageRow,
} from "@/lib/work/interviews";

const NOW = Date.parse("2026-10-15T06:00:00Z");
const H = 3_600_000;
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const techRound: StageRow = {
  id: "st-tech",
  stage_name: "Technical round",
  stage_order: 2,
  stage_type: "interview",
  interviewer_user_id: null,
  interviewer_email: null,
  interviewer_name: null,
};
const hmRound: StageRow = {
  id: "st-hm",
  stage_name: "Hiring manager",
  stage_order: 3,
  stage_type: "interview",
  interviewer_user_id: "u-1",
  interviewer: { user_id: "u-1", full_name: "Asha Rao", email: "asha@x.in" },
};
const review: StageRow = {
  id: "st-review",
  stage_name: "FitScore Review",
  stage_order: 1,
  stage_type: "system_auto",
  is_locked: true,
};

const pipeline: PipelineRow[] = [
  { id: "pc-a", status: "shortlisted", stage_id: "st-tech", candidates: { name: "Meera" } },
  { id: "pc-b", status: "in_progress", stage_id: "st-hm", candidates: { name: "Arjun" } },
  { id: "pc-c", status: "shortlisted", stage_id: "st-review", candidates: { name: "Dev" } },
  { id: "pc-d", status: "rejected", stage_id: "st-tech", candidates: { name: "Zoya" } },
  { id: "pc-e", status: "hired", stage_id: "st-hm", candidates: { name: "Kabir" } },
];

const interviews: AggregateInterview[] = [
  {
    slotId: "s-past-old",
    pipelineCandidateId: "pc-x",
    candidateName: "Old owed",
    scheduledStart: iso(-50 * H),
    scheduledEnd: iso(-49 * H),
    stageName: "Technical round",
    interviewerName: "Ravi",
    aggregateStatus: "pending_feedback",
  },
  {
    slotId: "s-past-new",
    pipelineCandidateId: "pc-y",
    candidateName: "New owed",
    scheduledStart: iso(-3 * H),
    scheduledEnd: iso(-2 * H),
    stageName: "Hiring manager",
    interviewerEmail: "hm@x.in",
    aggregateStatus: "pending_feedback",
  },
  {
    slotId: "s-done",
    pipelineCandidateId: "pc-z",
    candidateName: "Done",
    scheduledStart: iso(-30 * H),
    scheduledEnd: iso(-29 * H),
    feedbackSubmitted: true,
    aggregateStatus: "completed",
  },
  {
    slotId: "s-later",
    pipelineCandidateId: "pc-b",
    candidateName: "Arjun",
    scheduledStart: iso(48 * H),
    scheduledEnd: iso(49 * H),
    stageName: "Hiring manager",
    interviewerName: "Asha Rao",
    aggregateStatus: "upcoming",
  },
  {
    slotId: "s-soon",
    pipelineCandidateId: "pc-q",
    candidateName: "Soon",
    scheduledStart: iso(2 * H),
    scheduledEnd: iso(3 * H),
    aggregateStatus: "upcoming",
  },
];

const slots: AvailabilitySlot[] = [
  { id: "open-2", start_at: iso(72 * H), end_at: iso(73 * H), status: "available" },
  { id: "open-1", start_at: iso(24 * H), end_at: iso(25 * H), status: "available" },
  { id: "open-past", start_at: iso(-24 * H), end_at: iso(-23 * H), status: "available" },
  {
    id: "s-later",
    start_at: iso(48 * H),
    end_at: iso(49 * H),
    status: "booked",
    pipeline_candidate_id: "pc-b",
    candidate_email_status: "failed",
  },
];

const stages = [review, techRound, hmRound];

describe("interview board", () => {
  const board = buildInterviewBoard({ interviews, slots, pipeline, stages, now: NOW });

  it("puts owed scorecards first, oldest first, and knows when automation has nudged", () => {
    expect(board.owed.map((o) => o.slotId)).toEqual(["s-past-old", "s-past-new"]);
    expect(board.owed[0].reminded).toBe(true);
    expect(board.owed[1].reminded).toBe(false);
    expect(board.owed[1].interviewer).toBe("hm@x.in");
  });

  it("never lists a completed interview as owed or booked", () => {
    expect(board.owed.some((o) => o.slotId === "s-done")).toBe(false);
    expect(board.booked.some((b) => b.slotId === "s-done")).toBe(false);
  });

  it("lists upcoming interviews soonest first with failed invites", () => {
    expect(board.booked.map((b) => b.slotId)).toEqual(["s-soon", "s-later"]);
    expect(board.booked[1].failedInvites).toEqual(["candidate email"]);
  });

  it("schedules only active pipeline rows with nothing booked", () => {
    expect(board.toSchedule.map((t) => t.pipelineCandidateId)).toEqual(["pc-c", "pc-a"]);
  });

  it("flags interview rounds with no interviewer, once each", () => {
    const meera = board.toSchedule.find((t) => t.pipelineCandidateId === "pc-a")!;
    expect(meera.needsInterviewer).toBe(true);
    expect(meera.stageName).toBe("Technical round");
    const dev = board.toSchedule.find((t) => t.pipelineCandidateId === "pc-c")!;
    expect(dev.needsInterviewer).toBe(false);
    expect(board.stagesMissingInterviewer.map((s) => s.id)).toEqual(["st-tech"]);
  });

  it("offers only future open slots, soonest first", () => {
    expect(board.openSlots.map((s) => s.id)).toEqual(["open-1", "open-2"]);
  });

  it("falls back to booked slots when the interview feed is unavailable", () => {
    const degraded = buildInterviewBoard({ interviews: null, slots, pipeline, stages, now: NOW });
    expect(degraded.owed).toEqual([]);
    expect(degraded.booked.map((b) => b.slotId)).toEqual(["s-later"]);
    expect(degraded.booked[0].candidateName).toBe("Arjun");
    expect(degraded.booked[0].interviewer).toBe("Asha Rao");
    expect(degraded.toSchedule.map((t) => t.pipelineCandidateId)).toEqual(["pc-c", "pc-a"]);
  });

  it("is cleared once nothing is owed and every candidate is booked or sent a link", () => {
    const noOwed = { ...board, owed: [] };
    expect(isCleared(noOwed, new Set(["pc-a"]))).toBe(false);
    expect(isCleared(noOwed, new Set(["pc-a", "pc-c"]))).toBe(true);
    expect(isCleared(board, new Set(["pc-a", "pc-c"]))).toBe(false);
  });
});

describe("interviewer rules", () => {
  it("names the interviewer from the profile, then name, then email", () => {
    expect(interviewerLabel(hmRound)).toBe("Asha Rao");
    expect(interviewerLabel({ ...techRound, interviewer_email: "e@x.in" })).toBe("e@x.in");
    expect(interviewerLabel(techRound)).toBeNull();
  });

  it("needs an external interviewer's email and name, as the backend does", () => {
    expect(stageNeedsInterviewer({ ...techRound, interviewer_email: "e@x.in" })).toBe(true);
    expect(
      stageNeedsInterviewer({ ...techRound, interviewer_email: "e@x.in", interviewer_name: "E" }),
    ).toBe(false);
    expect(stageNeedsInterviewer(review)).toBe(false);
  });

  it("keeps the round's other settings when naming an interviewer", () => {
    const st: StageRow = {
      ...techRound,
      sla_days: 3,
      notify_candidate: true,
      color: "#123456",
      feedback_template_id: "t-1",
    };
    const body = stageWithInterviewer(st, { name: " Neha ", email: "NEHA@x.in" });
    expect(body.stages[0]).toMatchObject({
      id: "st-tech",
      stage_type: "interview",
      sla_days: 3,
      notify_candidate: true,
      color: "#123456",
      feedback_template_id: "t-1",
      interviewer_user_id: null,
      interviewer_email: "neha@x.in",
      interviewer_name: "Neha",
    });
    expect(stageWithInterviewer(st, { userId: "u-9" }).stages[0].interviewer_user_id).toBe("u-9");
  });
});

describe("scorecards", () => {
  const fields = [
    { label: "Problem solving", type: "rating", required: true, scale: ["No", "Yes"] },
    { label: "Notes", type: "text" },
  ];

  it("asks for required answers, a recommendation and an overall rating", () => {
    expect(scorecardGaps(fields, EMPTY_SCORECARD)).toEqual([
      "Problem solving",
      "Recommendation",
      "Overall rating",
    ]);
    expect(
      scorecardGaps(fields, {
        ...EMPTY_SCORECARD,
        responses: { "Problem solving": 2 },
        recommendation: "hire",
        overallRating: 4,
      }),
    ).toEqual([]);
  });

  it("lets 'cannot assess' go without an overall rating", () => {
    const form = { ...EMPTY_SCORECARD, responses: { "Problem solving": 1 } };
    expect(scorecardGaps(fields, { ...form, recommendation: "cannot_assess" })).toEqual([]);
    expect(
      feedbackBody("t", "pc", { ...form, recommendation: "cannot_assess" }),
    ).not.toHaveProperty("overall_rating");
  });

  it("pre-fills answers from the agent's draft but never the verdict", () => {
    const { form, evidence } = applyDraft(
      { ...EMPTY_SCORECARD, responses: { Notes: "mine" } },
      {
        fields: [
          { label: "Problem solving", value: 2, evidence: "I split it into steps" },
          { label: "Notes", value: "" },
        ],
        notes: "Strong call",
      },
    );
    expect(form.responses).toEqual({ "Problem solving": 2, Notes: "mine" });
    expect(form.recommendation).toBe("");
    expect(form.overallRating).toBe(0);
    expect(form.notes).toBe("Strong call");
    expect(evidence).toEqual({ "Problem solving": "I split it into steps" });
  });

  it("renders legacy ratings as 1–5 and yes/no as two options", () => {
    expect(scaleFor({ label: "x", type: "rating" })).toEqual(["1", "2", "3", "4", "5"]);
    expect(scaleFor({ label: "x", type: "yes_no" })).toEqual(["No", "Yes"]);
    expect(scaleFor({ label: "x", type: "text" })).toBeNull();
  });
});

describe("opening times", () => {
  it("splits declared windows into future hour slots on the hour grid", () => {
    const out = slotsFromWindows(
      [
        { starts_at: iso(-90 * 60_000), ends_at: iso(150 * 60_000) },
        { starts_at: iso(-5 * H), ends_at: iso(-4 * H) },
      ],
      NOW,
    );
    expect(out).toEqual([
      { start_at: iso(30 * 60_000), end_at: iso(90 * 60_000) },
      { start_at: iso(90 * 60_000), end_at: iso(150 * 60_000) },
    ]);
  });

  it("refuses a past or empty start for a new slot", () => {
    expect(slotFromLocalInput("", 45, NOW)).toBeNull();
    expect(slotFromLocalInput("2020-01-01T10:00", 45, NOW)).toBeNull();
    const s = slotFromLocalInput("2030-01-01T10:00", 45, NOW)!;
    expect(Date.parse(s.end_at) - Date.parse(s.start_at)).toBe(45 * 60_000);
  });
});

describe("words", () => {
  it("formats times in Indian English", () => {
    const s = formatWhen("2026-10-15T10:00:00Z", "Asia/Kolkata");
    expect(s).toMatch(/15 Oct/);
    expect(s).toMatch(/3:30/);
    expect(formatWhen(null)).toBe("Time not set");
  });

  it("says how long ago and how soon", () => {
    expect(endedAgo(iso(-2 * H), NOW)).toBe("Ended 2 hours ago");
    expect(endedAgo(iso(-30 * H), NOW)).toBe("Ended yesterday");
    expect(endedAgo(iso(-80 * H), NOW)).toBe("Ended 3 days ago");
    expect(startsIn(iso(3 * H), NOW)).toBe("In 3 hours");
    expect(startsIn(iso(26 * H), NOW)).toBe("Tomorrow");
  });

  it("says plainly when a link was made but not emailed", () => {
    expect(linkOutcome({ emailSent: false, emailError: "Candidate has no email on file" })).toEqual(
      { ok: false, text: "Link made, but not emailed: Candidate has no email on file" },
    );
    expect(linkOutcome({ emailSent: true }).ok).toBe(true);
  });
});

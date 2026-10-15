import { describe, expect, it } from "vitest";
import { fromAggregate, fromAssigned, weekView } from "@/lib/work/my-interviews";

const now = new Date(2031, 0, 8, 12, 0); // Wed 8 Jan 2031, noon

describe("your interviews", () => {
  const assigned = fromAssigned([
    {
      pipelineCandidateId: "p1",
      jobId: "j",
      candidateName: "Asha",
      jobTitle: "QA",
      stageName: "Tech",
      scheduledAt: new Date(2031, 0, 7, 10).toISOString(),
      feedbackSubmitted: false,
    },
    {
      pipelineCandidateId: "p2",
      jobId: "j",
      candidateName: "Ravi",
      jobTitle: "QA",
      stageName: "Tech",
      scheduledAt: new Date(2031, 0, 6, 10).toISOString(),
      feedbackSubmitted: true,
    },
    {
      pipelineCandidateId: "p3",
      jobId: "j",
      candidateName: "Meera",
      jobTitle: "QA",
      stageName: "Tech",
      scheduledAt: new Date(2031, 0, 8, 15).toISOString(),
      feedbackSubmitted: false,
    },
    {
      pipelineCandidateId: "p4",
      jobId: "j",
      candidateName: "Kiran",
      jobTitle: "QA",
      stageName: "HR",
      scheduledAt: new Date(2031, 0, 9, 11).toISOString(),
      feedbackSubmitted: false,
    },
  ]);

  it("puts past interviews without a scorecard first, and nothing already filed", () => {
    const v = weekView(assigned, now);
    expect(v.owed.map((i) => i.candidate)).toEqual(["Asha"]);
  });

  it("groups what's ahead as Today and Tomorrow", () => {
    const v = weekView(assigned, now);
    expect(v.days.map((d) => [d.label, d.items.map((i) => i.candidate)])).toEqual([
      ["Today", ["Meera"]],
      ["Tomorrow", ["Kiran"]],
    ]);
    expect(v.upcoming).toBe(2);
  });

  it("marks only your own slots as yours and drops cancelled ones", () => {
    const list = fromAggregate(
      [
        {
          slotId: "s1",
          pipelineCandidateId: "p",
          jobId: "j",
          jobTitle: "QA",
          candidateName: "A",
          scheduledStart: new Date(2031, 0, 8, 16).toISOString(),
          scheduledEnd: new Date(2031, 0, 8, 17).toISOString(),
          stageName: "Tech",
          interviewerName: "Me",
          interviewerEmail: null,
          interviewerUserId: "u1",
          feedbackSubmitted: false,
          aggregateStatus: "upcoming",
        },
        {
          slotId: "s2",
          pipelineCandidateId: "p",
          jobId: "j",
          jobTitle: "QA",
          candidateName: "B",
          scheduledStart: new Date(2031, 0, 8, 17).toISOString(),
          scheduledEnd: new Date(2031, 0, 8, 18).toISOString(),
          stageName: "Tech",
          interviewerName: "Sam",
          interviewerEmail: null,
          interviewerUserId: "u2",
          feedbackSubmitted: false,
          aggregateStatus: "cancelled",
        },
      ],
      "u1",
    );
    expect(list.map((i) => i.mine)).toEqual([true, false]);
    expect(weekView(list, now).upcoming).toBe(1);
  });
});

import { describe, it, expect } from "vitest";
import { buildSetupSequence, hiringRequestRef, type SetupInput } from "@/lib/v2/setup-sequence";

/**
 * Job Setup is five required hiring steps, then optional operations after
 * publish. The remaining gate is evaluation: a job open with applicants and no
 * approved rubric silently scores everyone on the generic path.
 */
function input(over: Partial<SetupInput> = {}): SetupInput {
  return {
    jdPublished: false,
    rubricApproved: false,
    screeningQuestionCount: 0,
    postShortlistQuestionCount: 0,
    interviewStageCount: 0,
    stagesWithInterviewer: 0,
    scorecardAttached: false,
    assessmentAttached: false,
    channelsLive: 0,
    applicants: 0,
    ...over,
  };
}

describe("buildSetupSequence", () => {
  it("does not call legacy scoring an approved evaluation", () => {
    const step = buildSetupSequence(input({ rubricNotRequired: true })).steps.find(
      (s) => s.key === "evaluation",
    );
    expect(step?.state).toBe("done");
    expect(step?.detail).not.toMatch(/approved/i);
  });
  it("never claims a description is published or bias checked", () => {
    const step = buildSetupSequence(input({ jdPublished: true })).steps.find((s) => s.key === "jd");
    expect(step?.detail).toBe("Description added");
  });
  it("returns five required hiring steps, then optional operations", () => {
    const seq = buildSetupSequence(input());
    expect(seq.steps.filter((s) => !s.optional).map((s) => s.key)).toEqual([
      "request",
      "jd",
      "requirements",
      "evaluation",
      "publish",
    ]);
    expect(seq.steps.filter((s) => s.optional).map((s) => s.key)).toEqual([
      "screening",
      "post-screening",
      "interview-plan",
      "scorecard",
      "assessment",
      "channels",
    ]);
  });

  it("treats post-shortlist screening as optional and never a gate", () => {
    const post = buildSetupSequence(input()).steps.find((s) => s.key === "post-screening");
    expect(post?.optional).toBe(true);
    expect(post?.state).not.toBe("blocked");
    expect(post?.detail).toMatch(/never auto-reject/i);
  });

  it("counts post-shortlist questions separately from apply-time knockouts", () => {
    const seq = buildSetupSequence(
      input({ screeningQuestionCount: 5, postShortlistQuestionCount: 4 }),
    );
    expect(seq.steps.find((s) => s.key === "screening")?.detail).toContain("5");
    expect(seq.steps.find((s) => s.key === "post-screening")?.detail).toContain("4");
  });

  it("counts only the unlinked request as done on an empty job", () => {
    const seq = buildSetupSequence(input());
    expect(seq.doneCount).toBe(1);
    expect(seq.percent).toBe(20);
    expect(seq.steps.find((s) => s.key === "request")?.state).toBe("done");
  });

  it("marks evaluation as the blocking gate when unapproved", () => {
    const seq = buildSetupSequence(input({ rubricApproved: false }));
    const evaluation = seq.steps.find((s) => s.key === "evaluation");
    expect(evaluation?.state).toBe("blocked");
    expect(seq.blockingStep?.key).toBe("evaluation");
  });

  it("says out loud how many people are being mis-scored while the gate is open", () => {
    const seq = buildSetupSequence(input({ rubricApproved: false, applicants: 201 }));
    expect(seq.steps.find((s) => s.key === "evaluation")?.detail).toContain("201");
  });

  it("clears the evaluation gate once the rubric is approved", () => {
    const seq = buildSetupSequence(input({ rubricApproved: true }));
    expect(seq.blockingStep).toBeNull();
    expect(seq.steps.find((s) => s.key === "evaluation")?.state).toBe("done");
    expect(seq.steps.find((s) => s.key === "requirements")?.state).toBe("done");
  });

  it("treats a pending hiring request as an incomplete required step", () => {
    const seq = buildSetupSequence(
      input({ hiringRequestId: "hr-1", hiringRequestStatus: "submitted" }),
    );
    expect(seq.steps.find((s) => s.key === "request")?.state).toBe("todo");
    expect(seq.doneCount).toBe(0);
  });

  it("blocks setup when the hiring request was rejected", () => {
    const seq = buildSetupSequence(
      input({ hiringRequestId: "hr-1", hiringRequestStatus: "rejected" }),
    );
    expect(seq.blockingStep?.key).toBe("request");
  });

  it("treats a converted hiring request as the request step done", () => {
    const seq = buildSetupSequence(
      input({ hiringRequestId: "hr-1", hiringRequestStatus: "converted" }),
    );
    expect(seq.steps.find((s) => s.key === "request")?.state).toBe("done");
  });

  it("treats a partly-staffed interview plan as partial, not done", () => {
    const seq = buildSetupSequence(input({ interviewStageCount: 3, stagesWithInterviewer: 1 }));
    const plan = seq.steps.find((s) => s.key === "interview-plan");
    expect(plan?.state).toBe("partial");
    expect(plan?.detail).toContain("1 of 3");
  });

  it("marks the interview plan done when every stage has an owner", () => {
    const seq = buildSetupSequence(input({ interviewStageCount: 2, stagesWithInterviewer: 2 }));
    expect(seq.steps.find((s) => s.key === "interview-plan")?.state).toBe("done");
  });

  it("treats screening, interviews, and scorecards as optional after publish", () => {
    const seq = buildSetupSequence(input());
    expect(seq.steps.find((s) => s.key === "assessment")?.optional).toBe(true);
    expect(seq.steps.find((s) => s.key === "screening")?.optional).toBe(true);
    expect(seq.steps.find((s) => s.key === "interview-plan")?.optional).toBe(true);
    expect(seq.steps.find((s) => s.key === "scorecard")?.optional).toBe(true);
    expect(seq.steps.find((s) => s.key === "evaluation")?.optional).toBe(false);
  });

  it("excludes optional steps from the progress denominator", () => {
    const seq = buildSetupSequence(input({ jdPublished: true, rubricApproved: true }));
    expect(seq.requiredCount).toBe(5);
    expect(seq.doneCount).toBe(4);
    expect(seq.percent).toBe(80);
  });

  it("reaches 100 percent when the five required steps are done", () => {
    const seq = buildSetupSequence(
      input({
        jdPublished: true,
        rubricApproved: true,
        roleOpen: true,
      }),
    );
    expect(seq.percent).toBe(100);
    expect(seq.blockingStep).toBeNull();
  });

  it("gives every step an absolute route to go and fix it", () => {
    for (const step of buildSetupSequence(input(), "job-1").steps) {
      expect(step.href.startsWith("/")).toBe(true);
      expect(step.href).toContain("job-1");
    }
  });

  it("points evaluation at where approval actually lives", () => {
    const evaluation = buildSetupSequence(input(), "job-1").steps.find(
      (s) => s.key === "evaluation",
    );
    expect(evaluation?.href).toBe("/recruit/jobs/job-1#ideal-profile-setup");
  });

  it("points a linked request at the requisition, not a new form", () => {
    const request = buildSetupSequence(
      input({ hiringRequestId: "hr-1", hiringRequestStatus: "submitted" }),
      "job-1",
    ).steps.find((s) => s.key === "request");
    expect(request?.href).toBe("/recruit/hiring-requests/hr-1");
  });

  it("points publish at the job editor where publication is confirmed", () => {
    const publish = buildSetupSequence(input(), "job-1").steps.find((s) => s.key === "publish");
    expect(publish?.href).toBe("/recruit/jobs/job-1/edit");
  });

  it("keeps channels inside v2, where the add-candidates page lives", () => {
    const channels = buildSetupSequence(input(), "job-1").steps.find((s) => s.key === "channels");
    expect(channels?.href).toBe("/recruit/v2/jobs/job-1/add");
  });
});

describe("hiringRequestRef", () => {
  it("reads a nested object or array the same way", () => {
    expect(
      hiringRequestRef({
        hiring_request_id: "hr-1",
        hiring_requests: { id: "hr-1", status: "converted" },
      }),
    ).toEqual({ id: "hr-1", status: "converted" });
    expect(
      hiringRequestRef({
        hiring_requests: [{ id: "hr-2", status: "submitted" }],
      }),
    ).toEqual({ id: "hr-2", status: "submitted" });
  });
});

describe("stageHasInterviewer", () => {
  it("accepts any of the shapes the pipeline API actually returns", async () => {
    const { stageHasInterviewer } = await import("@/lib/v2/setup-sequence");
    expect(stageHasInterviewer({ interviewer_user_id: "u1" })).toBe(true);
    expect(stageHasInterviewer({ interviewer_email: "a@b.com" })).toBe(true);
    expect(stageHasInterviewer({ interviewer_name: "Ishita" })).toBe(true);
    expect(stageHasInterviewer({ interviewer: { id: "u1" } })).toBe(true);
  });

  it("is false for an unassigned stage, including blank strings", () => {
    return import("@/lib/v2/setup-sequence").then(({ stageHasInterviewer }) => {
      expect(stageHasInterviewer({})).toBe(false);
      expect(stageHasInterviewer({ interviewer_name: "   ", interviewer_email: "" })).toBe(false);
      expect(stageHasInterviewer({ interviewer: null })).toBe(false);
    });
  });
});

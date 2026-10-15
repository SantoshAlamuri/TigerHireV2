import { describe, it, expect } from "vitest";
import {
  ownershipUntil,
  submissionSteps,
  VISIBILITY,
  OWNERSHIP_DAYS,
  type SubmissionInput,
} from "@/lib/v2/agency-submission";

function submission(over: Partial<SubmissionInput> = {}): SubmissionInput {
  return {
    status: "shortlisted",
    submittedAt: "2026-07-26T10:00:00.000Z",
    screeningAnsweredAt: "2026-07-26T18:00:00.000Z",
    scoredAt: "2026-07-27T09:00:00.000Z",
    interviewAt: null,
    rejectionReason: null,
    ...over,
  };
}

describe("ownership window", () => {
  it("runs 30 days from a clean submission", () => {
    expect(OWNERSHIP_DAYS).toBe(30);
    expect(ownershipUntil("2026-07-26T10:00:00.000Z")).toBe("2026-08-25T10:00:00.000Z");
  });

  it("claims no window when there is no submission date to run it from", () => {
    expect(ownershipUntil(null)).toBeNull();
    expect(ownershipUntil("nonsense")).toBeNull();
  });
});

describe("submission timeline", () => {
  it("marks completed steps with when they happened", () => {
    const steps = submissionSteps(submission());
    expect(steps[0]).toMatchObject({ label: "Submitted", state: "done" });
    expect(steps[2]).toMatchObject({ label: "Scored & queued", state: "done" });
  });

  /**
   * The held state is the whole point: a submission sitting still is usually a
   * candidate who has not replied on WhatsApp. Showing it as merely "pending"
   * hides the one thing the agency can actually do something about.
   */
  it("makes the first unfinished step the current one, with what to do", () => {
    const steps = submissionSteps(
      submission({ screeningAnsweredAt: null, scoredAt: null, status: "applied" }),
    );
    const current = steps.find((s) => s.state === "current");
    expect(current?.label).toBe("Screening answered");
    expect(current?.detail).toContain("yours to chase");
  });

  it("does not present a later step as actionable while an earlier one is open", () => {
    const steps = submissionSteps(
      submission({ screeningAnsweredAt: null, scoredAt: null, status: "applied" }),
    );
    expect(steps.filter((s) => s.state === "current")).toHaveLength(1);
    expect(steps.find((s) => s.label === "Scored & queued")?.state).toBe("pending");
  });

  it("closes the timeline with a category-level reason and nothing more", () => {
    const steps = submissionSteps(
      submission({ status: "rejected", rejectionReason: "compensation" }),
    );
    const closed = steps.at(-1);
    expect(closed).toMatchObject({ label: "Closed", state: "done" });
    expect(closed?.detail).toBe("reason: compensation");
  });

  it("says so plainly when a rejection carried no reason", () => {
    const steps = submissionSteps(submission({ status: "rejected", rejectionReason: null }));
    expect(steps.at(-1)?.detail).toContain("without a recorded reason");
  });

  it("offers nothing as actionable once the submission is closed", () => {
    const steps = submissionSteps(
      submission({ status: "rejected", screeningAnsweredAt: null, scoredAt: null }),
    );
    expect(steps.filter((s) => s.state === "current")).toHaveLength(0);
  });
});

describe("visibility boundary", () => {
  it("never exposes the score or other agencies' work", () => {
    const denied = VISIBILITY.filter((v) => !v.allowed);
    expect(denied).toHaveLength(1);
    expect(denied[0].text).toContain("score");
    expect(denied[0].text).toContain("other agencies");
    expect(denied[0].when).toBe("never");
  });

  it("keeps status and category-level close reasons always visible", () => {
    expect(VISIBILITY.filter((v) => v.allowed).every((v) => v.when === "always")).toBe(true);
  });
});

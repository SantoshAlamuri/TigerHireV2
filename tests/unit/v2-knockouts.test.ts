import { describe, it, expect } from "vitest";
import { evaluateKnockouts, stageColumns } from "@/lib/v2/knockouts";

/**
 * Knockout state for the screened list.
 *
 * The rule lives in two tables: job_screening_questions.fail_on_yes says which
 * answer disqualifies, application_screening_answers.answer_yes says what the
 * candidate said. Neither alone is a verdict.
 *
 * The important case is the one in the middle. A candidate who has answered two
 * of four questions has not passed and has not failed, and rendering "2/2
 * passed" for them would tell a recruiter to skip someone who was never
 * actually screened. Partial answers report as partial.
 */
const q = (id: string, failOnYes: boolean) => ({ id, failOnYes, active: true });

describe("evaluateKnockouts", () => {
  it("passes a candidate who avoided every disqualifying answer", () => {
    const k = evaluateKnockouts(
      [
        { questionId: "a", answerYes: false },
        { questionId: "b", answerYes: false },
      ],
      [q("a", true), q("b", true)],
    );
    expect(k.verdict).toBe("pass");
    expect(k.passed).toBe(2);
    expect(k.total).toBe(2);
    expect(k.label).toBe("2/2 passed");
  });

  it("fails a candidate on a single disqualifying answer", () => {
    const k = evaluateKnockouts(
      [
        { questionId: "a", answerYes: true },
        { questionId: "b", answerYes: false },
      ],
      [q("a", true), q("b", true)],
    );
    expect(k.verdict).toBe("fail");
    expect(k.label).toMatch(/failed/i);
  });

  it("respects a question that disqualifies on NO rather than yes", () => {
    const k = evaluateKnockouts([{ questionId: "a", answerYes: false }], [q("a", false)]);
    expect(k.verdict).toBe("fail");
  });

  it("reports partial rather than claiming a pass on incomplete answers", () => {
    const k = evaluateKnockouts(
      [{ questionId: "a", answerYes: false }],
      [q("a", true), q("b", true)],
    );
    expect(k.verdict).toBe("partial");
    expect(k.label).toMatch(/1 of 2/i);
  });

  it("says the job asks nothing rather than showing a hollow pass", () => {
    const k = evaluateKnockouts([], []);
    expect(k.verdict).toBe("none");
    expect(k.label).toMatch(/no screening questions/i);
  });

  it("says unanswered rather than partial when the candidate answered nothing", () => {
    const k = evaluateKnockouts([], [q("a", true)]);
    expect(k.verdict).toBe("unanswered");
    expect(k.label).toMatch(/not answered/i);
  });

  it("ignores inactive questions, which are no longer asked", () => {
    const k = evaluateKnockouts(
      [{ questionId: "a", answerYes: false }],
      [q("a", true), { id: "b", failOnYes: true, active: false }],
    );
    expect(k.total).toBe(1);
    expect(k.verdict).toBe("pass");
  });

  it("ignores answers to questions that no longer exist", () => {
    const k = evaluateKnockouts(
      [
        { questionId: "a", answerYes: false },
        { questionId: "gone", answerYes: true },
      ],
      [q("a", true)],
    );
    expect(k.verdict).toBe("pass");
  });
});

describe("stageColumns", () => {
  it("gives the screened list the columns the approved design specifies", () => {
    const cols = stageColumns("screened").map((c) => c.label);
    expect(cols).toEqual(["Candidate", "FitScore", "Knockouts", "Notice", "Expected CTC", "State"]);
  });

  it("gives the applied list source and screening state instead", () => {
    const cols = stageColumns("applied").map((c) => c.label);
    expect(cols).toContain("Source");
    expect(cols).toContain("Screening state");
  });

  it("falls back to a usable column set for any other stage", () => {
    const cols = stageColumns("whatever");
    expect(cols.length).toBeGreaterThan(1);
    expect(cols[0].label).toBe("Candidate");
  });
});

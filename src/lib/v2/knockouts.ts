/**
 * Knockout state for a screened candidate, and the column set each stage list
 * shows.
 *
 * The verdict needs both halves of the rule: `job_screening_questions`
 * .fail_on_yes says which answer disqualifies, `application_screening_answers`
 * .answer_yes says what the candidate said. Reading one without the other gives
 * an answer that looks authoritative and is not.
 *
 * "Partial" exists because it is the case that gets people wrongly skipped. A
 * candidate who answered two of four questions has neither passed nor failed,
 * and a green "2/2 passed" beside their name tells a recruiter the screening
 * cleared them when nobody asked them the rest.
 */
export interface KnockoutQuestion {
  id: string;
  /** True when answering YES disqualifies; false when answering NO does. */
  failOnYes: boolean;
  active: boolean;
}

export interface KnockoutAnswer {
  questionId: string;
  answerYes: boolean | null;
}

export type KnockoutVerdict = "pass" | "fail" | "partial" | "unanswered" | "none";

export interface KnockoutState {
  verdict: KnockoutVerdict;
  passed: number;
  total: number;
  label: string;
}

export function evaluateKnockouts(
  answers: KnockoutAnswer[],
  questions: KnockoutQuestion[],
): KnockoutState {
  const live = questions.filter((q) => q.active);
  if (live.length === 0) {
    return { verdict: "none", passed: 0, total: 0, label: "No screening questions on this job" };
  }

  const byId = new Map(live.map((q) => [q.id, q]));
  // Answers to deleted questions are noise, not evidence.
  const relevant = answers.filter((a) => byId.has(a.questionId) && a.answerYes !== null);

  if (relevant.length === 0) {
    return { verdict: "unanswered", passed: 0, total: live.length, label: "Not answered yet" };
  }

  let passed = 0;
  let failed = 0;
  for (const a of relevant) {
    const q = byId.get(a.questionId);
    if (!q) continue;
    const disqualified = q.failOnYes ? a.answerYes === true : a.answerYes === false;
    if (disqualified) failed += 1;
    else passed += 1;
  }

  if (failed > 0) {
    return {
      verdict: "fail",
      passed,
      total: live.length,
      label: `${failed} knockout${failed === 1 ? "" : "s"} failed`,
    };
  }
  if (relevant.length < live.length) {
    return {
      verdict: "partial",
      passed,
      total: live.length,
      label: `${passed} of ${live.length} answered`,
    };
  }
  return { verdict: "pass", passed, total: live.length, label: `${passed}/${live.length} passed` };
}

export interface StageColumn {
  key: string;
  label: string;
  align: "left" | "right";
}

const CANDIDATE: StageColumn = { key: "candidate", label: "Candidate", align: "left" };
const SCORE: StageColumn = { key: "score", label: "FitScore", align: "right" };
const STATE: StageColumn = { key: "state", label: "State", align: "left" };

/**
 * Each stage answers a different question, so each list shows different facts.
 * Applied is "where did these come from and have we asked them anything";
 * screened is "can we actually hire this person".
 */
export function stageColumns(stage: string): StageColumn[] {
  if (stage === "screened" || stage === "review") {
    return [
      CANDIDATE,
      SCORE,
      { key: "knockouts", label: "Knockouts", align: "left" },
      { key: "notice", label: "Notice", align: "right" },
      { key: "ctc", label: "Expected CTC", align: "right" },
      STATE,
    ];
  }
  if (stage === "applied") {
    return [
      CANDIDATE,
      SCORE,
      { key: "source", label: "Source", align: "left" },
      { key: "screening", label: "Screening state", align: "left" },
      STATE,
    ];
  }
  return [CANDIDATE, SCORE, { key: "location", label: "Location", align: "left" }, STATE];
}

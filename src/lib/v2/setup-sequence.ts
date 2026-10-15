/**
 * Job Setup as a guided sequence.
 *
 * Recruiters walk five required steps in hiring language: Request → Job
 * description → Hiring requirements → Candidate evaluation → Preview and
 * publish. Screening, interviews, scorecards, assessments, and channels stay
 * available after publish; they are not a gate on opening the role.
 *
 * The one gate that still cannot be missed is evaluation: without an approved
 * rubric, everyone is scored on the generic path and nothing else in the
 * product says so.
 */
import { requestStep, stepHref } from "./setup-sequence-steps";

export interface SetupInput {
  /** Description content exists; this does not imply publication. */
  jdPublished: boolean;
  rubricApproved: boolean;
  rubricNotRequired?: boolean;
  /** Knockout questions asked at apply/upload time. */
  screeningQuestionCount: number;
  /** Deeper questions sent once a candidate is shortlisted. */
  postShortlistQuestionCount: number;
  interviewStageCount: number;
  stagesWithInterviewer: number;
  scorecardAttached: boolean;
  assessmentAttached: boolean;
  channelsLive: number;
  /** Used only to say how many people are affected while the gate is open. */
  applicants: number;
  hiringRequestId?: string | null;
  hiringRequestStatus?: string | null;
  mustHaveCount?: number;
  /** Job status is open — internal or public. */
  roleOpen?: boolean;
}

export type StepState = "done" | "partial" | "todo" | "blocked";

export interface SetupStep {
  key: string;
  title: string;
  state: StepState;
  detail: string;
  /** Absolute path to go and complete this step. */
  href: string;
  optional: boolean;
}

export interface SetupSequence {
  steps: SetupStep[];
  requiredCount: number;
  doneCount: number;
  percent: number;
  blockingStep: SetupStep | null;
}

export function hiringRequestRef(job: {
  hiring_request_id?: string | null;
  hiring_requests?:
    | { id?: string; status?: string }
    | Array<{ id?: string; status?: string }>
    | null;
}): { id: string | null; status: string | null } {
  const nested = job.hiring_requests;
  const row = Array.isArray(nested) ? nested[0] : nested;
  return {
    id: job.hiring_request_id ?? row?.id ?? null,
    status: row?.status ?? null,
  };
}

export function buildSetupSequence(input: SetupInput, jobId = ""): SetupSequence {
  const planDone =
    input.interviewStageCount > 0 && input.stagesWithInterviewer >= input.interviewStageCount;
  const planPartial = input.interviewStageCount > 0 && input.stagesWithInterviewer > 0 && !planDone;
  const evaluationDone = Boolean(input.rubricApproved || input.rubricNotRequired);
  const requirementsDone = evaluationDone || (input.mustHaveCount ?? 0) > 0;
  const evaluationDetail = input.rubricNotRequired
    ? "Role-specific evaluation is not enabled for this organisation"
    : input.rubricApproved
      ? "Approved — scoring uses this role's bar"
      : input.applicants > 0
        ? `${input.applicants} applicant${input.applicants === 1 ? "" : "s"} — approve evaluation to enable role-specific scoring`
        : "Review and approve the role-specific evaluation";

  const steps: SetupStep[] = [
    requestStep(input, jobId),
    {
      key: "jd",
      title: "Job description",
      state: input.jdPublished ? "done" : "todo",
      detail: input.jdPublished ? "Description added" : "Add the job description",
      href: stepHref(jobId, "jd"),
      optional: false,
    },
    {
      key: "requirements",
      title: "Hiring requirements",
      state: requirementsDone ? "done" : "todo",
      detail: requirementsDone
        ? (input.mustHaveCount ?? 0) > 0
          ? `${input.mustHaveCount} must-have${input.mustHaveCount === 1 ? "" : "s"} on the role`
          : "Requirements captured with the evaluation"
        : "Add the must-haves this role will screen against",
      href: stepHref(jobId, "requirements"),
      optional: false,
    },
    {
      key: "evaluation",
      title: "Candidate evaluation",
      // The one gate: unapproved means every applicant scores on the generic path.
      state: evaluationDone ? "done" : "blocked",
      detail: evaluationDetail,
      href: stepHref(jobId, "evaluation"),
      optional: false,
    },
    {
      key: "publish",
      title: "Preview and publish",
      state: input.roleOpen ? "done" : "todo",
      detail: input.roleOpen ? "Role is open" : "Preview the listing and open the role",
      href: stepHref(jobId, "publish"),
      optional: false,
    },
    {
      key: "screening",
      title: "Screening questions",
      state: input.screeningQuestionCount > 0 ? "done" : "todo",
      detail: input.screeningQuestionCount
        ? `${input.screeningQuestionCount} asked on WhatsApp`
        : "Ask the questions you would ask on a first call",
      href: stepHref(jobId, "screening"),
      optional: true,
    },
    {
      key: "post-screening",
      title: "Post-shortlist questions",
      state: input.postShortlistQuestionCount > 0 ? "done" : "todo",
      detail: input.postShortlistQuestionCount
        ? `${input.postShortlistQuestionCount} asked after shortlisting`
        : "Optional deeper round — asked only after someone is shortlisted, and never auto-rejects",
      href: stepHref(jobId, "post-screening"),
      optional: true,
    },
    {
      key: "interview-plan",
      title: "Interview plan",
      state: planDone ? "done" : planPartial ? "partial" : "todo",
      detail: input.interviewStageCount
        ? `${input.stagesWithInterviewer} of ${input.interviewStageCount} stages have an interviewer`
        : "Define the rounds and who runs them",
      href: stepHref(jobId, "interview-plan"),
      optional: true,
    },
    {
      key: "scorecard",
      title: "Scorecard",
      state: input.scorecardAttached ? "done" : "todo",
      detail: input.scorecardAttached
        ? "Attached — feedback is structured"
        : "Without one, interview feedback is free text",
      href: stepHref(jobId, "scorecard"),
      optional: true,
    },
    {
      key: "assessment",
      title: "Assessment",
      state: input.assessmentAttached ? "done" : "todo",
      detail: input.assessmentAttached ? "Attached" : "Optional — skip unless the role needs it",
      href: stepHref(jobId, "assessment"),
      optional: true,
    },
    {
      key: "channels",
      title: "Channels",
      state: input.channelsLive > 0 ? "done" : "todo",
      detail: input.channelsLive
        ? `${input.channelsLive} live`
        : "Apply link, intake email, job boards",
      href: stepHref(jobId, "channels"),
      optional: true,
    },
  ];

  const required = steps.filter((s) => !s.optional);
  const doneCount = required.filter((s) => s.state === "done").length;
  return {
    steps,
    requiredCount: required.length,
    doneCount,
    percent: required.length ? Math.round((doneCount / required.length) * 100) : 0,
    blockingStep: steps.find((s) => s.state === "blocked") ?? null,
  };
}

/**
 * Whether a pipeline stage has an owner.
 *
 * The pipeline API returns the interviewer in several shapes depending on how
 * the stage was created (joined object, user id, or bare name/email), so this
 * accepts all of them rather than silently reporting "no interviewer".
 */
export function stageHasInterviewer(stage: {
  interviewer_user_id?: string | null;
  interviewer_email?: string | null;
  interviewer_name?: string | null;
  interviewer?: { id?: string } | null;
}): boolean {
  return Boolean(
    stage.interviewer_user_id?.trim() ||
    stage.interviewer_email?.trim() ||
    stage.interviewer_name?.trim() ||
    stage.interviewer,
  );
}

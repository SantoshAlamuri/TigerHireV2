/**
 * Step destinations and the requisition step for the guided job setup.
 *
 * Split out of setup-sequence.ts to keep that module under the repo's file-size
 * gate; the behaviour is unchanged. Everything here is internal to the setup
 * sequence — nothing outside it should import these directly.
 */
import { mapRequisitionStatus } from "@/lib/jobs/job-readiness";
import type { SetupInput, SetupStep } from "./setup-sequence";

/**
 * Absolute destinations. These are deliberately full paths rather than
 * sub-paths: an earlier version composed them under /recruit/v2/... and every
 * one 404'd, because the editors live on the legacy job routes. The rubric
 * points at the plan document anchor, which is where approval lives today.
 */
export function stepHref(jobId: string, key: string, hiringRequestId?: string | null): string {
  const legacy = `/recruit/jobs/${jobId}`;
  switch (key) {
    case "request":
      return hiringRequestId
        ? `/recruit/hiring-requests/${hiringRequestId}`
        : `/recruit/jobs/${jobId}`;
    case "jd":
      return `${legacy}/edit`;
    case "requirements":
    case "evaluation":
      return `${legacy}#ideal-profile-setup`;
    case "publish":
      return `${legacy}/edit`;
    case "screening":
    case "post-screening":
      return `${legacy}/screening`;
    case "interview-plan":
      return `${legacy}/pipeline-stages`;
    case "scorecard":
      return `${legacy}/feedback-templates`;
    case "assessment":
      return `${legacy}/assessments`;
    case "channels":
      return `/recruit/v2/jobs/${jobId}/add`;
    default:
      return legacy;
  }
}

export function requestStep(input: SetupInput, jobId: string): SetupStep {
  const status = mapRequisitionStatus(
    input.hiringRequestId ?? null,
    input.hiringRequestStatus ?? null,
  );
  const href = stepHref(jobId, "request", input.hiringRequestId);
  if (status === "not_linked") {
    return {
      key: "request",
      title: "Request",
      state: "done",
      detail: "Opened without a requisition",
      href,
      optional: false,
    };
  }
  if (status === "approved") {
    return {
      key: "request",
      title: "Request",
      state: "done",
      detail: "Hiring request approved",
      href,
      optional: false,
    };
  }
  if (status === "rejected" || status === "on_hold") {
    return {
      key: "request",
      title: "Request",
      state: "blocked",
      detail: status === "on_hold" ? "Hiring request is on hold" : "Hiring request was rejected",
      href,
      optional: false,
    };
  }
  return {
    key: "request",
    title: "Request",
    state: "todo",
    detail:
      status === "draft"
        ? "Hiring request is still a draft"
        : "Hiring request is waiting for approval",
    href,
    optional: false,
  };
}

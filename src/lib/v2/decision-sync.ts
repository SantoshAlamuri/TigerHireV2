import type { Decision, DecisionRecord } from "./review-queue";
import type { ApplicationStatus } from "@/types";

/**
 * Turns a queue decision into the application status the rest of the product
 * already understands, and keeps the reject reason attached.
 *
 * Holding is deliberately "viewed" rather than "shortlisted": a recruiter who
 * parks someone has not endorsed them, and shortlisting on hold would quietly
 * inflate the shortlist a hiring manager sees.
 */
export function statusForDecision(decision: Decision): ApplicationStatus {
  if (decision === "advance") return "shortlisted";
  if (decision === "reject") return "rejected";
  return "viewed";
}

export interface DecisionPayload {
  status: ApplicationStatus;
  rejection_reason?: string;
}

export function buildDecisionPayload(record: DecisionRecord): DecisionPayload {
  const payload: DecisionPayload = { status: statusForDecision(record.decision) };
  if (record.decision === "reject" && record.reason) {
    payload.rejection_reason = record.reason;
  }
  return payload;
}

/** Hold is the only durable undo: viewed → applied. Shortlist/reject stay put. */
export function holdRestorePayload(): { status: "applied" } {
  return { status: "applied" };
}

export function isHoldRestoreAllowed(currentStatus: string, nextStatus: string): boolean {
  return nextStatus === "applied" && currentStatus === "viewed";
}

export interface DecisionSummary {
  advanced: number;
  held: number;
  rejected: number;
  total: number;
}

export function summariseDecisions(records: DecisionRecord[]): DecisionSummary {
  const summary: DecisionSummary = { advanced: 0, held: 0, rejected: 0, total: records.length };
  for (const r of records) {
    if (r.decision === "advance") summary.advanced++;
    else if (r.decision === "reject") summary.rejected++;
    else summary.held++;
  }
  return summary;
}

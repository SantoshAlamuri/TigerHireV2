import type { ApplicationStatus, JobPosting } from "@/types";

export type StatusTone = "success" | "info" | "warning" | "danger" | "neutral";

export const APPLICATION_STATUS_TONES: Record<ApplicationStatus, StatusTone> = {
  applied: "success",
  viewed: "info",
  shortlisted: "success",
  rejected: "danger",
  hired: "success",
  withdrawn: "neutral",
};

export type ApprovalStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "on_hold"
  | "pending"
  | "approved"
  | "converted"
  | "rejected";

export const APPROVAL_STATUS_TONES: Record<ApprovalStatus, StatusTone> = {
  draft: "neutral",
  submitted: "warning",
  under_review: "warning",
  on_hold: "warning",
  pending: "warning",
  approved: "success",
  converted: "success",
  rejected: "danger",
};

export type ApprovalSource = "hiring_request" | "offer_finance" | "candidate_shortlist";

export const APPROVAL_SOURCE_TONES: Record<ApprovalSource, StatusTone> = {
  hiring_request: "info",
  offer_finance: "warning",
  candidate_shortlist: "neutral",
};

export type PipelineStatus = "shortlisted" | "in_progress" | "hired" | "rejected";

export const PIPELINE_STATUS_TONES: Record<PipelineStatus, StatusTone> = {
  shortlisted: "info",
  in_progress: "warning",
  hired: "success",
  rejected: "danger",
};

export type JobPriorityToneKey = NonNullable<JobPosting["internalPriority"]> | "low" | "unassigned";

export const JOB_PRIORITY_TONES: Record<JobPriorityToneKey, StatusTone> = {
  critical: "danger",
  urgent: "danger",
  high: "warning",
  normal: "info",
  low: "neutral",
  unassigned: "neutral",
};

export const ORCHESTRATOR_RUN_TONES: Record<string, StatusTone> = {
  running: "info",
  paused: "warning",
  completed: "success",
  failed: "danger",
  cancelled: "neutral",
};

export const BIAS_SEVERITY_TONES: Record<string, StatusTone> = {
  high: "danger",
  medium: "warning",
  low: "info",
};

export const FEEDBACK_RECOMMENDATION_TONES: Record<string, StatusTone> = {
  strong_hire: "success",
  hire: "info",
  no_hire: "danger",
  strong_no_hire: "danger",
};

export const INTERVIEW_SLOT_TONES: Record<string, StatusTone> = {
  booked: "warning",
  available: "success",
};

export const DISTRIBUTION_STATUS_TONES: Record<string, StatusTone> = {
  pushed: "success",
  removed: "neutral",
  failed: "danger",
};

export const PREP_PRIORITY_TONES: Record<string, StatusTone> = {
  critical: "warning",
  high: "info",
  medium: "neutral",
  low: "neutral",
};

export const AGENT_TYPE_TONES: Record<string, StatusTone> = {
  talent_scout: "info",
  hiring_signal: "warning",
  fitscore: "warning",
  scout: "info",
  verify: "info",
  scheduler: "info",
  orchestrator: "warning",
  ghostbuster: "danger",
  auto_reply: "neutral",
  info_request: "neutral",
};

export const AGENT_RUN_TONES: Record<string, StatusTone> = {
  completed: "success",
  completed_with_errors: "warning",
  running: "warning",
  failed: "danger",
  success: "success",
  error: "danger",
  paused: "warning",
  cancelled: "neutral",
};

export const ORG_APPROVAL_TONES: Record<string, StatusTone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

export function getApplicationStatusTone(status: ApplicationStatus): StatusTone {
  return APPLICATION_STATUS_TONES[status] ?? "neutral";
}

export function getApprovalStatusTone(status: string | null | undefined): StatusTone {
  if (!status) return "neutral";
  return APPROVAL_STATUS_TONES[status as ApprovalStatus] ?? "neutral";
}

export function getApprovalSourceTone(source: ApprovalSource): StatusTone {
  return APPROVAL_SOURCE_TONES[source] ?? "neutral";
}

export function getPipelineStatusTone(status: string): StatusTone {
  return PIPELINE_STATUS_TONES[status as PipelineStatus] ?? "neutral";
}

export function getOrchestratorRunTone(status: string): StatusTone {
  return ORCHESTRATOR_RUN_TONES[status] ?? "neutral";
}

export function getBiasSeverityTone(severity: string): StatusTone {
  return BIAS_SEVERITY_TONES[severity] ?? "neutral";
}

export function getFeedbackRecommendationTone(recommendation: string): StatusTone {
  const normalized = recommendation.trim().toLowerCase().replace(/\s+/g, "_");
  if (FEEDBACK_RECOMMENDATION_TONES[normalized]) {
    return FEEDBACK_RECOMMENDATION_TONES[normalized];
  }
  if (normalized.includes("no_hire") || normalized.includes("reject")) return "danger";
  if (normalized.includes("hire")) return "success";
  return "neutral";
}

export function getInterviewSlotTone(status: string): StatusTone {
  return INTERVIEW_SLOT_TONES[status] ?? "neutral";
}

export function getDistributionStatusTone(status: string): StatusTone {
  return DISTRIBUTION_STATUS_TONES[status] ?? "neutral";
}

export function getPrepPriorityTone(priority: string): StatusTone {
  return PREP_PRIORITY_TONES[priority] ?? "neutral";
}

export function getAgentTypeTone(agentType: string): StatusTone {
  return AGENT_TYPE_TONES[agentType] ?? "neutral";
}

export function getAgentRunTone(runStatus: string): StatusTone {
  return AGENT_RUN_TONES[runStatus] ?? "neutral";
}

export function getOrgApprovalTone(approval: string): StatusTone {
  return ORG_APPROVAL_TONES[approval] ?? "neutral";
}

export function getJobLifecycleTone(isActive: boolean): StatusTone {
  return isActive ? "success" : "neutral";
}

export function getJobPriorityTone(priority: JobPosting["internalPriority"]): StatusTone {
  if (!priority) return JOB_PRIORITY_TONES.unassigned;
  return JOB_PRIORITY_TONES[priority as JobPriorityToneKey] ?? "neutral";
}

import type { AgentRunStatus, AgentType } from "@/types";

export const ADMIN_AGENT_LABELS: Record<AgentType, string> = {
  talent_scout: "Talent Scout",
  hiring_signal: "Hiring Signal",
  fitscore: "Scoring",
  orchestrator: "Interview Orchestrator",
  scheduler: "Interview Scheduler",
  scout: "Scout",
  verify: "Verify",
  vouch: "Vouch",
  public_apply: "Public Apply",
  consent: "Consent",
  ghostbuster: "Ghostbuster",
  trust_score: "Trust Score",
  normalizer: "Normalizer",
  validator: "Validator",
  auto_reply: "Auto Reply",
  info_request: "Info Request",
  communication: "Communication",
};

export const ADMIN_AGENT_FILTER_OPTIONS: ReadonlyArray<{ value: AgentType; label: string }> = (
  Object.entries(ADMIN_AGENT_LABELS) as Array<[AgentType, string]>
).map(([value, label]) => ({
  value,
  label,
}));

export const ADMIN_AGENT_STATUS_FILTER_OPTIONS: ReadonlyArray<{
  value: AgentRunStatus;
  label: string;
}> = [
  { value: "running", label: "Running" },
  { value: "completed", label: "Completed" },
  { value: "completed_with_errors", label: "Completed with errors" },
  { value: "failed", label: "Failed" },
  { value: "success", label: "Success" },
  { value: "error", label: "Error" },
  { value: "paused", label: "Paused" },
  { value: "cancelled", label: "Cancelled" },
];

export const ADMIN_RUN_AGENT_OPTIONS = [
  { value: "talent_scout", label: "Talent Scout" },
  { value: "fitscore", label: "Scoring" },
] as const;

export type AdminRunAgentType = (typeof ADMIN_RUN_AGENT_OPTIONS)[number]["value"];

export const ADMIN_ACTION_AGENT_NAMES = [
  "talent_scout",
  "fitscore",
  "scout",
  "verify",
  "scheduler",
  "vouch",
  "consent",
  "auto_reply",
  "info_request",
] as const;

export type AdminActionAgentName = (typeof ADMIN_ACTION_AGENT_NAMES)[number];

export function isAdminActionAgentName(value: string): value is AdminActionAgentName {
  return (ADMIN_ACTION_AGENT_NAMES as readonly string[]).includes(value);
}

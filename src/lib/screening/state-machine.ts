import { SCREENING_TERMINAL_STATUSES } from "./types";
import type { ScreeningStatus } from "./types";

const ALLOWED_TRANSITIONS: Record<ScreeningStatus, readonly ScreeningStatus[]> = {
  queued: ["awaiting_consent", "skipped", "cancelled"],
  awaiting_consent: ["in_progress", "cancelled", "no_response"],
  in_progress: ["completed", "failed", "cancelled", "no_response"],
  completed: [],
  no_response: [],
  failed: [],
  cancelled: [],
  skipped: [],
} as const;

const TERMINAL_STATUS_SET = new Set<ScreeningStatus>(SCREENING_TERMINAL_STATUSES);

export function getAllowedScreeningTransitions(
  status: ScreeningStatus,
): readonly ScreeningStatus[] {
  return ALLOWED_TRANSITIONS[status];
}

export function isTerminalScreeningStatus(status: ScreeningStatus): boolean {
  return TERMINAL_STATUS_SET.has(status);
}

export function canTransitionScreeningStatus(
  current: ScreeningStatus,
  next: ScreeningStatus,
): boolean {
  return ALLOWED_TRANSITIONS[current].includes(next);
}

export function assertTransitionAllowed(current: ScreeningStatus, next: ScreeningStatus): void {
  if (!canTransitionScreeningStatus(current, next)) {
    throw new Error(`Invalid screening status transition: ${current} -> ${next}`);
  }
}

export function canOverrideScreeningMode(status: ScreeningStatus): boolean {
  return !isTerminalScreeningStatus(status);
}

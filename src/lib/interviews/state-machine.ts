export const INTERVIEW_STATES = [
  "slots_sent",
  "slot_picked",
  "booked",
  "reminded",
  "attended",
  "no_show",
  "cancelled",
  "rescheduled",
] as const;

export type InterviewState = (typeof INTERVIEW_STATES)[number];

const ALLOWED_TRANSITIONS: Record<InterviewState, InterviewState[]> = {
  slots_sent: ["slots_sent", "slot_picked", "booked", "cancelled"],
  slot_picked: ["booked", "cancelled"],
  booked: ["reminded", "rescheduled", "cancelled", "attended", "no_show"],
  reminded: ["rescheduled", "cancelled", "attended", "no_show"],
  rescheduled: ["booked", "cancelled"],
  attended: [],
  no_show: [],
  cancelled: [],
};

export function canTransition(from: InterviewState, to: InterviewState): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: InterviewState, to: InterviewState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid interview transition: ${from} -> ${to}`);
  }
}

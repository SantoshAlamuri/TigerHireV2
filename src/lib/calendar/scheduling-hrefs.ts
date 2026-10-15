import type { CalendarEventKind } from "@/lib/calendar/org-calendar-events";

/** Where recruiters act on interview slots for a job. */
export function jobSchedulingHref(jobId: string): string {
  return `/recruit/jobs/${jobId}/interviews`;
}

/** Best destination when clicking a calendar row, by event type. */
export function calendarEventHref(kind: CalendarEventKind, jobId: string): string {
  switch (kind) {
    case "interview":
      return jobSchedulingHref(jobId);
    case "assessment_deadline":
      return `/recruit/jobs/${jobId}/assessments`;
    case "offer_expiry":
      return `/recruit/jobs/${jobId}`;
    default:
      return jobSchedulingHref(jobId);
  }
}

export const CALENDAR_EVENT_ACTION_LABEL: Record<CalendarEventKind, string> = {
  interview: "Open scheduling",
  assessment_deadline: "View assessments",
  offer_expiry: "Open job plan",
};

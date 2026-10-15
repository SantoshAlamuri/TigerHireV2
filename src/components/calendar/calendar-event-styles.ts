import type { OrgCalendarEvent } from "@/lib/calendar/org-calendar-events";

export const CALENDAR_KIND_LABEL: Record<OrgCalendarEvent["kind"], string> = {
  interview: "Interview",
  assessment_deadline: "Assessment due",
  offer_expiry: "Offer expires",
};

export const CALENDAR_KIND_CHIP_CLASS: Record<OrgCalendarEvent["kind"], string> = {
  interview: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
  assessment_deadline: "border-amber-500/40 bg-amber-500/15 text-amber-200",
  offer_expiry: "border-rose-500/40 bg-rose-500/15 text-rose-200",
};

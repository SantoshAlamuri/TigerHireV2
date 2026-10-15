import {
  CALENDAR_KIND_CHIP_CLASS,
  CALENDAR_KIND_LABEL,
} from "@/components/calendar/calendar-event-styles";
import type { CalendarEventKind } from "@/lib/calendar/org-calendar-events";

const KINDS: CalendarEventKind[] = ["interview", "assessment_deadline", "offer_expiry"];

export function CalendarKindLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2" aria-label="Event types">
      <span className="text-xs font-medium text-white/60">Legend</span>
      {KINDS.map((kind) => (
        <span
          key={kind}
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${CALENDAR_KIND_CHIP_CLASS[kind]}`}
        >
          {CALENDAR_KIND_LABEL[kind]}
        </span>
      ))}
    </div>
  );
}

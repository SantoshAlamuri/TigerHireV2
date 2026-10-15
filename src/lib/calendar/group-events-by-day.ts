import { toDateKeyInTimezone } from "@/lib/calendar/calendar-timezone";
import type { OrgCalendarEvent } from "@/lib/calendar/org-calendar-events";

export function groupEventsByLocalDay(
  events: OrgCalendarEvent[],
  timeZone: string,
): Map<string, OrgCalendarEvent[]> {
  const map = new Map<string, OrgCalendarEvent[]>();
  for (const ev of events) {
    const key = toDateKeyInTimezone(ev.startAt, timeZone);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(ev);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.startAt.localeCompare(b.startAt));
  }
  return map;
}

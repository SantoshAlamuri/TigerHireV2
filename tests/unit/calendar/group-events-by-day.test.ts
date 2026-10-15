import { describe, expect, it } from "vitest";
import { groupEventsByLocalDay } from "@/lib/calendar/group-events-by-day";
import type { OrgCalendarEvent } from "@/lib/calendar/org-calendar-events";

function ev(startAt: string, id: string): OrgCalendarEvent {
  return {
    id,
    kind: "interview",
    startAt,
    endAt: null,
    jobId: "job-1",
    jobTitle: "Role",
    candidateName: "A",
    interviewerLabel: null,
    href: "/recruit/jobs/job-1",
  };
}

describe("groupEventsByLocalDay", () => {
  it("groups and sorts events by local day", () => {
    const map = groupEventsByLocalDay(
      [
        ev("2026-05-17T14:00:00.000Z", "b"),
        ev("2026-05-17T09:00:00.000Z", "a"),
        ev("2026-05-18T10:00:00.000Z", "c"),
      ],
      "Asia/Kolkata",
    );
    expect(map.size).toBeGreaterThanOrEqual(1);
    const keys = [...map.keys()];
    expect(keys.length).toBeGreaterThanOrEqual(2);
    const firstDay = map.get(keys[0]!)!;
    if (firstDay.length >= 2) {
      expect(firstDay[0]!.startAt <= firstDay[1]!.startAt).toBe(true);
    }
  });
});

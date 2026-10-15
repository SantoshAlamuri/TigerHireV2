import { describe, expect, it } from "vitest";
import {
  byDay,
  dayGrid,
  dayKey,
  firstUsefulDay,
  localTime,
  mergeChoices,
  nextDays,
  type Choice,
} from "@/lib/work/time-picker";

const now = Date.parse("2026-10-15T08:00:00Z"); // Thu 15 Oct, 1:30pm IST

describe("time picker", () => {
  it("shows exactly two weeks starting today, in IST", () => {
    const days = nextDays(now);
    expect(days).toHaveLength(14);
    expect(days[0]).toMatchObject({ key: "2026-10-15", weekday: "Thu", today: true });
    expect(days[2]).toMatchObject({ key: "2026-10-17", weekend: true });
    expect(days[13].key).toBe("2026-10-28");
  });

  it("maps IST wall time to UTC", () => {
    expect(new Date(localTime("2026-10-19", 10 * 60)).toISOString()).toBe(
      "2026-10-19T04:30:00.000Z",
    );
    expect(dayKey(Date.parse("2026-10-18T20:00:00Z"))).toBe("2026-10-19");
  });

  it("builds a 9am-8pm grid, skipping the past and marking busy times", () => {
    const busy = [
      { start: localTime("2026-10-15", 15 * 60), end: localTime("2026-10-15", 16 * 60) },
    ];
    const grid = dayGrid("2026-10-15", 45, busy, now);
    // Now is 1:30pm, one hour notice: first start 2:30pm.
    expect(grid[0].start).toBe(localTime("2026-10-15", 14 * 60 + 30));
    expect(grid.find((g) => g.start === localTime("2026-10-15", 15 * 60))?.busy).toBe(true);
    expect(grid.find((g) => g.start === localTime("2026-10-15", 16 * 60))?.busy).toBe(false);
    expect(grid[grid.length - 1].end).toBeLessThanOrEqual(localTime("2026-10-15", 20 * 60));
  });

  it("never suggests a time that overlaps one already open", () => {
    const open: Choice[] = [
      {
        kind: "open",
        slotId: "s1",
        start: localTime("2026-10-19", 600),
        end: localTime("2026-10-19", 645),
        owner: null,
      },
    ];
    const suggested: Choice[] = [
      {
        kind: "new",
        start: localTime("2026-10-19", 630),
        end: localTime("2026-10-19", 675),
        free: "everyone",
      },
      {
        kind: "new",
        start: localTime("2026-10-19", 720),
        end: localTime("2026-10-19", 765),
        free: "everyone",
      },
    ];
    expect(mergeChoices(open, suggested).map((c) => c.start)).toEqual([
      localTime("2026-10-19", 600),
      localTime("2026-10-19", 720),
    ]);
  });

  it("opens on the first day that has times", () => {
    const days = nextDays(now);
    const grouped = byDay([{ start: localTime("2026-10-20", 600) }]);
    expect(firstUsefulDay(days, grouped)).toBe("2026-10-20");
    expect(firstUsefulDay(days, new Map())).toBe("2026-10-16");
  });
});

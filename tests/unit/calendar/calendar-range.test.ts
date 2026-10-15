import { describe, expect, it } from "vitest";
import {
  addDays,
  monthGridDays,
  startOfWeek,
  toLocalDateKey,
  weekRangeFromAnchor,
} from "@/lib/calendar/calendar-range";

describe("calendar-range", () => {
  it("startOfWeek returns Monday for a Wednesday", () => {
    const wed = new Date(2026, 4, 13, 15, 0, 0);
    const mon = startOfWeek(wed);
    expect(mon.getDay()).toBe(1);
    expect(mon.getDate()).toBe(11);
  });

  it("weekRangeFromAnchor spans seven days", () => {
    const anchor = new Date(2026, 4, 13);
    const { from, to, weekStart } = weekRangeFromAnchor(anchor);
    expect(weekStart.getDay()).toBe(1);
    expect(to.getTime() - from.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("monthGridDays returns 42 cells", () => {
    expect(monthGridDays(new Date(2026, 4, 1))).toHaveLength(42);
  });

  it("toLocalDateKey is stable", () => {
    const d = new Date(2026, 4, 17, 23, 59, 0);
    expect(toLocalDateKey(d)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(addDays(d, 1).getDate()).toBe(18);
  });
});

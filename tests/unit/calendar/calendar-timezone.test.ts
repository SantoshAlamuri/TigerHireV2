import { describe, expect, it } from "vitest";
import {
  addDaysToDateKey,
  toDateKeyInTimezone,
  weekDayKeysInTimezone,
} from "@/lib/calendar/calendar-timezone";

describe("calendar-timezone", () => {
  it("toDateKeyInTimezone uses IANA zone", () => {
    const key = toDateKeyInTimezone("2026-05-17T18:30:00.000Z", "Asia/Kolkata");
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("weekDayKeysInTimezone returns 7 consecutive keys", () => {
    const anchor = new Date("2026-05-13T12:00:00.000Z");
    const keys = weekDayKeysInTimezone(anchor, "Asia/Kolkata");
    expect(keys).toHaveLength(7);
    expect(addDaysToDateKey(keys[0]!, 1)).toBe(keys[1]);
  });
});

import { describe, expect, it } from "vitest";
import { isWithinCallingWindow, nextCallingWindowStartIso } from "@/lib/screening/calling-hours";

describe("calling-hours guardrail", () => {
  it("returns false for 21:00 IST when window is 10:00-19:00", () => {
    const now = new Date("2026-05-13T15:30:00.000Z"); // 21:00 IST
    const allowed = isWithinCallingWindow({
      start: "10:00:00",
      end: "19:00:00",
      now,
    });
    expect(allowed).toBe(false);
  });

  it("schedules to next day start when outside calling window", () => {
    const now = new Date("2026-05-13T15:30:00.000Z"); // 21:00 IST
    const scheduled = nextCallingWindowStartIso({
      start: "10:00:00",
      now,
    });
    expect(scheduled).toBe("2026-05-14T04:30:00.000Z"); // 10:00 IST next day
  });
});

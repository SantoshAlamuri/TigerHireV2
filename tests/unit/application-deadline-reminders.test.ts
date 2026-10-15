import { describe, it, expect } from "vitest";
import {
  hoursUntil,
  planApplicationDeadlineReminder,
} from "@/lib/jobs/application-deadline-reminders";

describe("hoursUntil", () => {
  it("returns hours between now and iso date", () => {
    const now = new Date("2026-04-12T12:00:00.000Z").getTime();
    const close = "2026-04-14T12:00:00.000Z";
    expect(hoursUntil(close, now)).toBe(48);
  });
});

describe("planApplicationDeadlineReminder", () => {
  it("returns null when past deadline", () => {
    expect(
      planApplicationDeadlineReminder({
        hoursLeft: -1,
        sent7d: false,
        sent24h: false,
      }),
    ).toBeNull();
  });

  it("prioritises 24h over 7d in the last day", () => {
    expect(
      planApplicationDeadlineReminder({
        hoursLeft: 10,
        sent7d: false,
        sent24h: false,
      }),
    ).toBe("24h");
  });

  it("sends 7d when outside 24h but within 7 days", () => {
    expect(
      planApplicationDeadlineReminder({
        hoursLeft: 48,
        sent7d: false,
        sent24h: false,
      }),
    ).toBe("7d");
  });

  it("skips 7d when already sent", () => {
    expect(
      planApplicationDeadlineReminder({
        hoursLeft: 48,
        sent7d: true,
        sent24h: false,
      }),
    ).toBeNull();
  });

  it("allows 24h after 7d was sent", () => {
    expect(
      planApplicationDeadlineReminder({
        hoursLeft: 12,
        sent7d: true,
        sent24h: false,
      }),
    ).toBe("24h");
  });

  it("skips when both sent", () => {
    expect(
      planApplicationDeadlineReminder({
        hoursLeft: 12,
        sent7d: true,
        sent24h: true,
      }),
    ).toBeNull();
  });
});

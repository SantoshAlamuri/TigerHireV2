import { describe, expect, it } from "vitest";
import { nudgeDueAt, timeoutDueAt } from "@/lib/screening/inactivity";

describe("screening inactivity timing", () => {
  it("derives 6h nudge and 24h timeout from activity watermark", () => {
    const activityAt = "2026-05-13T10:00:00.000Z";
    expect(nudgeDueAt(activityAt).toISOString()).toBe("2026-05-13T16:00:00.000Z");
    expect(timeoutDueAt(activityAt).toISOString()).toBe("2026-05-14T10:00:00.000Z");
  });
});

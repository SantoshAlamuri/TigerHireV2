import { describe, expect, it } from "vitest";
import { ackWindowStartIso, isWithinDedupWindow } from "@/lib/acknowledgements/idempotency";

describe("acknowledgements/idempotency", () => {
  it("computes 24h window start correctly", () => {
    const now = new Date("2026-04-28T12:00:00.000Z");
    expect(ackWindowStartIso(now, 24)).toBe("2026-04-27T12:00:00.000Z");
  });

  it("treats retry within window as duplicate and outside window as eligible", () => {
    const firstSent = new Date("2026-04-28T10:00:00.000Z");
    const secondWithin = new Date("2026-04-28T18:00:00.000Z");
    const thirdOutside = new Date("2026-04-29T10:00:01.000Z");

    expect(isWithinDedupWindow(firstSent, secondWithin, 24)).toBe(true);
    expect(isWithinDedupWindow(firstSent, thirdOutside, 24)).toBe(false);
  });
});

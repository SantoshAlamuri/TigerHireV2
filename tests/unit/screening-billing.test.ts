import { describe, expect, it } from "vitest";
import { calculateVoiceChargeInr } from "@/lib/screening/billing";

describe("calculateVoiceChargeInr", () => {
  it("keeps the 10th completed voice call free", () => {
    const charge = calculateVoiceChargeInr({
      completedCallsThisMonthBeforeCurrent: 9,
      freeCreditsPerMonth: 10,
      unitPriceInr: 99,
    });
    expect(charge).toBe(0);
  });

  it("charges from the 11th completed voice call onward", () => {
    const charge = calculateVoiceChargeInr({
      completedCallsThisMonthBeforeCurrent: 10,
      freeCreditsPerMonth: 10,
      unitPriceInr: 99,
    });
    expect(charge).toBe(99);
  });
});

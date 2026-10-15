import { describe, expect, it } from "vitest";
import { calculateVoiceChargeInr } from "@/lib/screening/billing";

describe("voice billing boundary under sequential completions", () => {
  it("assigns one free and one paid when two completions happen at 9 used", () => {
    // Simulates the atomic completion ordering expectation:
    // first completion sees 9 prior -> free, second sees 10 prior -> paid.
    const firstCharge = calculateVoiceChargeInr({
      completedCallsThisMonthBeforeCurrent: 9,
      freeCreditsPerMonth: 10,
      unitPriceInr: 99,
    });
    const secondCharge = calculateVoiceChargeInr({
      completedCallsThisMonthBeforeCurrent: 10,
      freeCreditsPerMonth: 10,
      unitPriceInr: 99,
    });

    expect(firstCharge).toBe(0);
    expect(secondCharge).toBe(99);
  });
});

import { describe, expect, it } from "vitest";
import { isOptOutKeyword, shouldSkipAutomatedScreening } from "@/lib/screening/compliance";

describe("isOptOutKeyword", () => {
  it("matches case-insensitive opt-out keywords with punctuation", () => {
    expect(isOptOutKeyword(" STOP ")).toBe(true);
    expect(isOptOutKeyword("unsubscribe.")).toBe(true);
    expect(isOptOutKeyword("Do Not Call!")).toBe(true);
    expect(isOptOutKeyword("opt out")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(isOptOutKeyword("stop by tomorrow")).toBe(false);
    expect(isOptOutKeyword("maybe later")).toBe(false);
  });
});

describe("shouldSkipAutomatedScreening", () => {
  it("skips voice/whatsapp when candidate is opted out", () => {
    expect(
      shouldSkipAutomatedScreening({
        doNotCall: true,
        requestedMode: "voice",
      }),
    ).toBe(true);
    expect(
      shouldSkipAutomatedScreening({
        doNotCall: true,
        requestedMode: "whatsapp",
      }),
    ).toBe(true);
  });

  it("allows manual/none when candidate is opted out", () => {
    expect(
      shouldSkipAutomatedScreening({
        doNotCall: true,
        requestedMode: "manual",
      }),
    ).toBe(false);
    expect(
      shouldSkipAutomatedScreening({
        doNotCall: true,
        requestedMode: "none",
      }),
    ).toBe(false);
  });
});

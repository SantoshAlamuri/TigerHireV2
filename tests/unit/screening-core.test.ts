import { describe, expect, it } from "vitest";
import { resolveScreeningMode } from "@/lib/screening/mode-resolver";
import {
  canTransitionScreeningStatus,
  getAllowedScreeningTransitions,
  isTerminalScreeningStatus,
} from "@/lib/screening/state-machine";

describe("resolveScreeningMode", () => {
  it("returns none when score is below threshold", () => {
    const result = resolveScreeningMode({
      fitScore: 62,
      tenant: {
        screening_default_mode: "whatsapp",
        screening_fitscore_threshold: 75,
        voice_screening_enabled: false,
        voice_screening_monthly_cap_inr: null,
      },
    });
    expect(result.mode).toBe("none");
    expect(result.reason).toBe("below_threshold");
  });

  it("falls back from voice to whatsapp when voice is disabled", () => {
    const result = resolveScreeningMode({
      fitScore: 88,
      tenant: {
        screening_default_mode: "voice",
        screening_fitscore_threshold: 75,
        voice_screening_enabled: false,
        voice_screening_monthly_cap_inr: null,
      },
    });
    expect(result.mode).toBe("whatsapp");
    expect(result.fallbackApplied).toBe(true);
    expect(result.reason).toBe("voice_disabled_fallback_whatsapp");
  });

  it("falls back from voice to whatsapp when monthly cap would be exceeded", () => {
    const result = resolveScreeningMode({
      fitScore: 90,
      tenant: {
        screening_default_mode: "voice",
        screening_fitscore_threshold: 70,
        voice_screening_enabled: true,
        voice_screening_monthly_cap_inr: 1000,
      },
      monthToDateVoiceSpendInr: 950,
      expectedNextVoiceChargeInr: 99,
    });
    expect(result.mode).toBe("whatsapp");
    expect(result.reason).toBe("voice_cap_fallback_whatsapp");
  });
});

describe("screening state machine", () => {
  it("allows normal progression transitions", () => {
    expect(canTransitionScreeningStatus("queued", "awaiting_consent")).toBe(true);
    expect(canTransitionScreeningStatus("awaiting_consent", "in_progress")).toBe(true);
    expect(canTransitionScreeningStatus("in_progress", "completed")).toBe(true);
  });

  it("blocks invalid transitions from terminal states", () => {
    expect(isTerminalScreeningStatus("completed")).toBe(true);
    expect(canTransitionScreeningStatus("completed", "in_progress")).toBe(false);
    expect(getAllowedScreeningTransitions("failed")).toEqual([]);
  });
});

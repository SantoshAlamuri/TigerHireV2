import { describe, expect, it } from "vitest";
import {
  APPLICATION_CONFIDENCE_BONUS_MAX,
  applicationCompletenessBonusFromRow,
} from "@/lib/fitscore/hybrid/application-confidence-boost";

describe("applicationCompletenessBonusFromRow", () => {
  it("returns 0 for empty input", () => {
    expect(applicationCompletenessBonusFromRow(null, 0)).toBe(0);
  });

  it("adds partial bonus for hireability fields", () => {
    const b = applicationCompletenessBonusFromRow(
      {
        notice_period_days: 30,
        expected_ctc_lpa: 24,
      },
      0,
    );
    expect(b).toBeGreaterThan(0);
    expect(b).toBeLessThanOrEqual(APPLICATION_CONFIDENCE_BONUS_MAX);
  });

  it("adds screening contribution without hireability row", () => {
    expect(applicationCompletenessBonusFromRow(null, 2)).toBeGreaterThan(0);
  });

  it("caps total bonus", () => {
    const maxed = applicationCompletenessBonusFromRow(
      {
        notice_period_days: 60,
        expected_ctc_lpa: 40,
        current_ctc_lpa: 35,
        relocation_willingness: "yes",
        available_from: "2026-06-01",
        offers_in_hand: 1,
      },
      5,
    );
    expect(maxed).toBe(APPLICATION_CONFIDENCE_BONUS_MAX);
  });
});

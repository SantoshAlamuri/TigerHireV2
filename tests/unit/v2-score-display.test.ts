import { describe, it, expect } from "vitest";
import { stripEmbeddedScore, bandFor, scoreDisplay } from "@/lib/v2/score-display";

/**
 * One number, one source of truth.
 *
 * A real row on preview stores overall_score = 53 while its one_line_summary
 * text begins "FitScore 56 (Moderate Fit)" — the prose was generated before
 * calibration was applied, and it is frozen in the database forever. The
 * pipeline is correct today, but any historical row still contradicts itself.
 *
 * So v2 never renders a number that lives inside stored prose. It renders the
 * stored score, and strips the embedded one from the narrative.
 */
describe("stripEmbeddedScore", () => {
  it("removes a stale leading FitScore claim", () => {
    const out = stripEmbeddedScore(
      "FitScore 56 (Moderate Fit); verdict: Pass. Top dimensions: test_strategy.",
    );
    expect(out).not.toContain("56");
    // The clause is kept, re-capitalised now that it leads the sentence.
    expect(out).toContain("Pass");
    expect(out.startsWith("Verdict:")).toBe(true);
  });

  it("keeps other numbers, which are real information", () => {
    const out = stripEmbeddedScore(
      "FitScore 56 (Moderate Fit); verdict: Pass. Ideal profile match 62%. Top 68% of 69 candidates.",
    );
    expect(out).toContain("62%");
    expect(out).toContain("69 candidates");
  });

  it("leaves prose alone when it makes no score claim", () => {
    const text = "Prathiba is a detail-oriented manual QA engineer.";
    expect(stripEmbeddedScore(text)).toBe(text);
  });

  it("handles empty and missing input", () => {
    expect(stripEmbeddedScore("")).toBe("");
    expect(stripEmbeddedScore(null)).toBe("");
    expect(stripEmbeddedScore(undefined)).toBe("");
  });

  it("strips the claim even without a parenthetical label", () => {
    expect(stripEmbeddedScore("FitScore 71; verdict: Strong.")).not.toContain("71");
  });
});

describe("bandFor", () => {
  it("derives the band from the score, never from stored text", () => {
    expect(bandFor(92).label).toBe("Strong fit");
    expect(bandFor(78).label).toBe("Good fit");
    expect(bandFor(64).label).toBe("Moderate fit");
    expect(bandFor(41).label).toBe("Below bar");
  });

  it("puts the boundaries where the thresholds say, not one off", () => {
    expect(bandFor(90).label).toBe("Strong fit");
    expect(bandFor(89).label).toBe("Good fit");
    expect(bandFor(75).label).toBe("Good fit");
    expect(bandFor(74).label).toBe("Moderate fit");
    expect(bandFor(60).label).toBe("Moderate fit");
    expect(bandFor(59).label).toBe("Below bar");
  });

  it("treats an absent score as unscored rather than zero", () => {
    expect(bandFor(null).label).toBe("Not scored");
    expect(bandFor(0).label).toBe("Not scored");
  });
});

describe("scoreDisplay", () => {
  it("returns the stored score and its derived band together", () => {
    const d = scoreDisplay(53, "FitScore 56 (Moderate Fit); verdict: Pass.");
    expect(d.score).toBe(53);
    expect(d.band.label).toBe("Below bar");
    expect(d.narrative).not.toContain("56");
  });

  it("flags when the stored prose disagreed, so the drift is visible not hidden", () => {
    expect(scoreDisplay(53, "FitScore 56 (Moderate Fit).").staleNarrativeScore).toBe(56);
    expect(scoreDisplay(53, "FitScore 53 (Moderate Fit).").staleNarrativeScore).toBeNull();
    expect(scoreDisplay(53, "No claim here.").staleNarrativeScore).toBeNull();
  });

  it("is safe when there is no score at all", () => {
    const d = scoreDisplay(null, null);
    expect(d.score).toBeNull();
    expect(d.band.label).toBe("Not scored");
    expect(d.narrative).toBe("");
  });
});

describe("the Decision Strip case seen on production data", () => {
  it("does not let stored prose quote a score the card contradicts", () => {
    // Real candidate: the card shows Quality 81 (the live calibrated
    // overallScore) while the stored narrative opens "FitScore 88 (Strong Fit)".
    // The prose was written before calibration moved the number and was never
    // rewritten. A recruiter reads two scores for one candidate and cannot tell
    // which is current — and in a demo, that is the question that gets asked.
    const stored =
      "FitScore 88 (Strong Fit); verdict: Strong Hire. Top dimensions: test_automation; api_testing.";
    const d = scoreDisplay(81, stored);

    expect(d.score).toBe(81);
    expect(d.narrative).not.toMatch(/88/);
    expect(d.staleNarrativeScore).toBe(88);
  });

  it("leaves the narrative alone when it agrees with the live score", () => {
    const d = scoreDisplay(88, "FitScore 88 (Strong Fit); verdict: Strong Hire.");
    expect(d.staleNarrativeScore).toBeNull();
  });

  it("survives a narrative with no score in it at all", () => {
    const d = scoreDisplay(81, "Verdict: Strong Hire. Top dimensions: test_automation.");
    expect(d.staleNarrativeScore).toBeNull();
    expect(d.narrative).toMatch(/Strong Hire/);
  });

  it("prefers the persisted band over default cutoffs so the chip agrees with the verdict (#350)", () => {
    // Default cutoffs would call 76 "Good fit". A JD with a lower strong threshold
    // persisted "Strong Fit" — the chip must follow the JD's band, not 90/75/60.
    const d = scoreDisplay(76, null, "Strong Fit");
    expect(d.band.label).toBe("Strong fit");
    expect(d.band.tone).toBe("strong");
  });

  it("falls back to score cutoffs when no persisted band is present", () => {
    const d = scoreDisplay(76, null, null);
    expect(d.band.label).toBe("Good fit");
  });
});

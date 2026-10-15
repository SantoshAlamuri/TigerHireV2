import { describe, it, expect } from "vitest";
import { fuseQuality } from "@/lib/v2/quality-fusion";

/**
 * Quality of hire, retention, manager satisfaction and predictive validity.
 *
 * These four tiles were rendering a dash with a reason — but the reason was a
 * hardcoded null on our side, not an absence of data. They would have stayed
 * blank forever, including on an org with a full year of 90-day pulses, because
 * nothing ever asked. /api/analytics/quality-of-hire already computes all four
 * from views that exist. A tile that cannot light up when the data arrives is
 * not an empty state, it is dead code with a caption.
 */
const q = (over = {}) => ({
  job_id: "j1",
  job_title: "Backend",
  hires_count: 4,
  avg_performance_rating: 4.2,
  rated_count: 4,
  avg_hire_fitscore: 78,
  ...over,
});

const p = (over = {}) => ({
  job_id: "j1",
  job_title: "Backend",
  pulses_tracked: 4,
  pulses_responded: 3,
  left_count: 1,
  avg_pulse_score: 8.1,
  ...over,
});

describe("fuseQuality", () => {
  it("averages quality of hire across jobs, weighted by rated hires", () => {
    const r = fuseQuality(
      [
        q({ avg_pulse_score: undefined, avg_performance_rating: 4.0, rated_count: 9 }),
        q({ avg_performance_rating: 2.0, rated_count: 1 }),
      ],
      [],
      [],
    );
    // A job with 9 rated hires must outweigh one with a single rating; a plain
    // mean would report 3.0 where the org actually sits at 3.8.
    expect(r.qualityOfHire.value).toBe(3.8);
  });

  it("computes retention from pulses tracked and people who left", () => {
    const r = fuseQuality([], [p({ pulses_tracked: 10, left_count: 2 })], []);
    expect(r.retention90.value).toBe(80);
    expect(r.retention90.note).toMatch(/10/);
  });

  it("computes manager satisfaction from pulse scores", () => {
    const r = fuseQuality([], [p({ avg_pulse_score: 8.1, pulses_responded: 3 })], []);
    expect(r.hmSatisfaction.value).toBe(8.1);
    expect(r.hmSatisfaction.note).toMatch(/3 response/i);
  });

  it("reports predictive validity only once bands actually separate", () => {
    const r = fuseQuality(
      [],
      [],
      [
        { fitscore_band: "80-100", hires: 6, avg_performance_rating: 4.4 },
        { fitscore_band: "0-49", hires: 5, avg_performance_rating: 2.9 },
      ],
    );
    expect(r.fitScoreValidity.value).not.toBeNull();
    expect(r.fitScoreValidity.note).toMatch(/11 hires|band/i);
  });

  it("withholds validity on a sample too small to mean anything", () => {
    const r = fuseQuality(
      [],
      [],
      [{ fitscore_band: "80-100", hires: 2, avg_performance_rating: 4.4 }],
    );
    expect(r.fitScoreValidity.value).toBeNull();
    expect(r.fitScoreValidity.note).toMatch(/at least 10/i);
  });

  it("still says why when every view is empty, rather than showing zeros", () => {
    const r = fuseQuality([], [], []);
    for (const m of [r.qualityOfHire, r.retention90, r.hmSatisfaction, r.fitScoreValidity]) {
      expect(m.value).toBeNull();
      expect(m.note.length).toBeGreaterThan(8);
    }
  });

  it("ignores jobs with hires but no ratings instead of scoring them zero", () => {
    const r = fuseQuality([q({ avg_performance_rating: null, rated_count: 0 })], [], []);
    expect(r.qualityOfHire.value).toBeNull();
  });
});

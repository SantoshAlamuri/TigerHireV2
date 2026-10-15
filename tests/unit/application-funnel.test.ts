import { describe, expect, it } from "vitest";
import {
  combineApplicationFunnelRows,
  type ApplicationFunnelRow,
} from "@/lib/analytics/application-funnel";

describe("combineApplicationFunnelRows", () => {
  const row = (partial: Partial<ApplicationFunnelRow>): ApplicationFunnelRow => ({
    job_id: "j1",
    organisation_id: "o1",
    job_title: "Job",
    applied_count: 0,
    screened_count: 0,
    shortlisted_count: 0,
    interviewed_count: 0,
    offered_count: 0,
    hired_count: 0,
    withdrawn_count: 0,
    rejected_count: 0,
    conversion_rate: null,
    ...partial,
  });

  it("returns null for empty input", () => {
    expect(combineApplicationFunnelRows([])).toBeNull();
  });

  it("returns the single row unchanged", () => {
    const a = row({
      job_id: "a",
      applied_count: 10,
      hired_count: 1,
      conversion_rate: 0.1,
    });
    expect(combineApplicationFunnelRows([a])).toEqual(a);
  });

  it("sums counts and recomputes conversion_rate", () => {
    const combined = combineApplicationFunnelRows([
      row({
        job_id: "j1",
        applied_count: 100,
        hired_count: 5,
        withdrawn_count: 2,
        rejected_count: 3,
      }),
      row({
        job_id: "j2",
        applied_count: 50,
        hired_count: 10,
        screened_count: 20,
        shortlisted_count: 8,
        interviewed_count: 4,
        offered_count: 2,
        withdrawn_count: 1,
        rejected_count: 1,
      }),
    ]);
    expect(combined).not.toBeNull();
    expect(combined!.applied_count).toBe(150);
    expect(combined!.hired_count).toBe(15);
    expect(combined!.withdrawn_count).toBe(3);
    expect(combined!.rejected_count).toBe(4);
    expect(combined!.screened_count).toBe(20);
    expect(combined!.conversion_rate).toBeCloseTo(0.1, 5);
  });
});

import { describe, it, expect } from "vitest";
import { reusableRubrics, type RubricSource } from "@/lib/v2/rubric-reuse";

/**
 * Rubrics are keyed per job, so twelve open roles means twelve bars built from
 * scratch and no way to say "all our backend roles use this one". A shared
 * library needs a schema change; reuse does not — an approved rubric on another
 * job can be copied as a starting point today.
 *
 * The ranking rule: the most similar role first, then the most recently
 * approved, because a stale bar is a worse starting point than a fresh one.
 */
function src(over: Partial<RubricSource> = {}): RubricSource {
  return {
    jobId: "job-2",
    jobTitle: "Backend Engineer",
    approvedBy: "A. Menon",
    approvedAt: "2026-07-01T00:00:00Z",
    mustHaveCount: 4,
    ...over,
  };
}

describe("reusableRubrics", () => {
  it("excludes the job you are already setting up", () => {
    const out = reusableRubrics("job-1", "Backend Engineer", [src({ jobId: "job-1" })]);
    expect(out).toEqual([]);
  });

  it("excludes rubrics nobody approved — an unapproved bar is not a template", () => {
    const out = reusableRubrics("job-1", "Backend", [src({ approvedBy: null })]);
    expect(out).toEqual([]);
  });

  it("excludes empty rubrics, which would be a worse start than nothing", () => {
    const out = reusableRubrics("job-1", "Backend", [src({ mustHaveCount: 0 })]);
    expect(out).toEqual([]);
  });

  it("ranks a closely-matching role title first", () => {
    const out = reusableRubrics("job-1", "Senior Backend Engineer", [
      src({ jobId: "a", jobTitle: "QA Engineer" }),
      src({ jobId: "b", jobTitle: "Backend Engineer" }),
    ]);
    expect(out[0].jobId).toBe("b");
    expect(out[0].similar).toBe(true);
  });

  it("still offers unrelated rubrics, just ranked lower and not marked similar", () => {
    const out = reusableRubrics("job-1", "Product Designer", [
      src({ jobId: "a", jobTitle: "Backend Engineer" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].similar).toBe(false);
  });

  it("breaks a tie by most recently approved", () => {
    const out = reusableRubrics("job-1", "Backend Engineer", [
      src({ jobId: "old", jobTitle: "Backend Engineer", approvedAt: "2026-01-01T00:00:00Z" }),
      src({ jobId: "new", jobTitle: "Backend Engineer", approvedAt: "2026-07-01T00:00:00Z" }),
    ]);
    expect(out[0].jobId).toBe("new");
  });

  it("ignores case and noise words when judging similarity", () => {
    const out = reusableRubrics("job-1", "Senior  BACKEND  Engineer II", [
      src({ jobTitle: "Backend Engineer" }),
    ]);
    expect(out[0].similar).toBe(true);
  });

  it("does not call two roles similar on a shared noise word alone", () => {
    // "Engineer" on its own is not a match — QA and Backend are different bars.
    const out = reusableRubrics("job-1", "QA Engineer", [src({ jobTitle: "Backend Engineer" })]);
    expect(out[0].similar).toBe(false);
  });

  it("is safe with no candidates to reuse", () => {
    expect(reusableRubrics("job-1", "Backend", [])).toEqual([]);
  });

  it("survives a missing or blank title on either side", () => {
    expect(() => reusableRubrics("job-1", "", [src({ jobTitle: "" })])).not.toThrow();
    expect(reusableRubrics("job-1", "", [src({ jobTitle: "" })])[0].similar).toBe(false);
  });
});

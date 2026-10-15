import { describe, it, expect } from "vitest";
import { pipelineByJob, formatPipeline } from "@/lib/v2/job-pipeline";

/**
 * Per-job pipeline counts for the jobs list.
 *
 * The list already showed a computed "blocker" chip — but it was fed
 * applicants: 0, rubricApproved: true and zeros for everything else, so every
 * job on the screen got the same verdict derived from numbers nobody measured.
 * A blocker that does not read the pipeline is worse than no blocker: it looks
 * like a diagnosis.
 */
const a = (jobId: string, status: string) => ({ job_id: jobId, status });

describe("pipelineByJob", () => {
  it("counts each stage for each job separately", () => {
    const m = pipelineByJob([
      a("j1", "applied"),
      a("j1", "shortlisted"),
      a("j1", "hired"),
      a("j2", "applied"),
    ]);
    expect(m.get("j1")?.applied).toBe(3);
    expect(m.get("j1")?.shortlisted).toBe(1);
    expect(m.get("j1")?.hired).toBe(1);
    expect(m.get("j2")?.applied).toBe(1);
  });

  it("counts applied as everyone, not only the untouched", () => {
    // "Applied 312 → 84 → 18" is a funnel: the first number is the total that
    // came in, not what is left sitting at the first stage.
    const m = pipelineByJob([a("j1", "hired"), a("j1", "rejected")]);
    expect(m.get("j1")?.applied).toBe(2);
  });

  it("counts awaiting review separately from the total", () => {
    const m = pipelineByJob([a("j1", "applied"), a("j1", "applied"), a("j1", "shortlisted")]);
    expect(m.get("j1")?.awaitingReview).toBe(2);
  });

  it("ignores rows with no job", () => {
    expect(pipelineByJob([{ job_id: null, status: "applied" }]).size).toBe(0);
  });
});

describe("formatPipeline", () => {
  it("renders the funnel in stage order", () => {
    expect(
      formatPipeline({
        applied: 312,
        awaitingReview: 18,
        shortlisted: 84,
        interviewed: 6,
        offered: 1,
        hired: 0,
      }),
    ).toBe("312 → 84 → 6 → 1 → 0");
  });

  it("says so rather than printing a row of zeros for a job with nobody in it", () => {
    expect(
      formatPipeline({
        applied: 0,
        awaitingReview: 0,
        shortlisted: 0,
        interviewed: 0,
        offered: 0,
        hired: 0,
      }),
    ).toBe("no applicants yet");
  });
});

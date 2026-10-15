import { describe, it, expect } from "vitest";
import {
  fuseTimeToHire,
  fuseOfferAcceptance,
  fusePlatformCostPerHire,
  fuseReqsPerRecruiter,
  periodParams,
} from "@/lib/v2/analytics-fusion";
import { fuseJobTable } from "@/lib/v2/analytics-jobs";
import { resolvePeriod } from "@/lib/v2/period";

/**
 * v2's screens computed everything client-side from the first 100 application
 * rows. v1 already had nine server endpoints reading SQL views over ALL the
 * data, with caching, role restrictions and CSV export. The v2 numbers were
 * therefore less trustworthy than the ones it was replacing.
 *
 * This adapts the v1 payloads to the v2 tiles. The honest-null rule survives the
 * move: a view that returns no rows still yields null with a reason, never a
 * zero. What changes is that "not tracked yet" now means the ORG has no data,
 * not that this screen forgot to ask.
 */
describe("fuseTimeToHire", () => {
  it("weights each job's average by how many people it hired", () => {
    // A job that hired 9 people should dominate one that hired 1; a plain mean
    // of the two job averages would report 55 days instead of 24.
    const r = fuseTimeToHire([
      { avg_days_to_hire: 20, hired_count: 9 },
      { avg_days_to_hire: 90, hired_count: 1 },
    ]);
    expect(r.value).toBe(27);
    expect(r.note).toMatch(/10 hires/i);
  });

  it("returns null with a reason when no job has hired anyone", () => {
    const r = fuseTimeToHire([{ avg_days_to_hire: null, hired_count: 0 }]);
    expect(r.value).toBeNull();
    expect(r.note).toMatch(/no hires/i);
  });

  it("ignores jobs with a hire count but no measured duration", () => {
    const r = fuseTimeToHire([
      { avg_days_to_hire: 30, hired_count: 2 },
      { avg_days_to_hire: null, hired_count: 5 },
    ]);
    expect(r.value).toBe(30);
    expect(r.note).toMatch(/2 hires/i);
  });

  it("says the view is empty rather than reporting zero days", () => {
    expect(fuseTimeToHire([]).value).toBeNull();
  });
});

describe("fuseOfferAcceptance", () => {
  it("uses the server's acceptance rate when it has decided offers", () => {
    const r = fuseOfferAcceptance({
      total_offers: 10,
      accepted_count: 6,
      declined_count: 2,
      acceptance_rate: 75,
    });
    expect(r.value).toBe(75);
    expect(r.note).toMatch(/8 decided/i);
  });

  it("does not report a rate when every offer is still outstanding", () => {
    const r = fuseOfferAcceptance({
      total_offers: 3,
      accepted_count: 0,
      declined_count: 0,
      acceptance_rate: null,
    });
    expect(r.value).toBeNull();
    expect(r.note).toMatch(/still outstanding|no offers decided/i);
  });

  it("handles a missing payload rather than throwing", () => {
    expect(fuseOfferAcceptance(null).value).toBeNull();
  });
});

describe("fusePlatformCostPerHire", () => {
  it("reports the server figure, named and denominated for what it is", () => {
    const r = fusePlatformCostPerHire({ cost_per_hire_usd: 1450, hired_count: 4 });
    expect(r.value).toBe(1450);
    expect(r.note).toMatch(/4 hires/i);
    // The endpoint sums TigerHire's own AI spend in USD. Calling it "cost per
    // hire" in rupees-implied terms would be read as agency and job-board spend.
    expect(r.label).toMatch(/platform/i);
    expect(r.unit).toMatch(/usd/i);
    expect(r.note).toMatch(/not agency or job-board/i);
  });

  it("passes through the server's own explanation when it declines to answer", () => {
    // The endpoint returns a note for the hiring-manager case; inventing our own
    // wording would contradict it.
    const r = fusePlatformCostPerHire({
      cost_per_hire_usd: null,
      hired_count: 0,
      note: "Org-level spend is not scoped to a hiring manager in this report.",
    });
    expect(r.value).toBeNull();
    expect(r.note).toMatch(/not scoped to a hiring manager/i);
  });

  it("says spend is untracked when there is no figure and no explanation", () => {
    const r = fusePlatformCostPerHire({ cost_per_hire_usd: null, hired_count: 3 });
    expect(r.note).toMatch(/no platform cost recorded/i);
  });
});

describe("fuseReqsPerRecruiter", () => {
  it("divides open reqs across the recruiters the server returned", () => {
    const r = fuseReqsPerRecruiter([{ user_id: "a" }, { user_id: "b" }], 10);
    expect(r.value).toBe(5);
  });

  it("flags an overloaded desk", () => {
    expect(fuseReqsPerRecruiter([{ user_id: "a" }], 12).tone).toBe("warn");
  });

  it("returns null when the org has no recruiters on record", () => {
    expect(fuseReqsPerRecruiter([], 10).value).toBeNull();
  });
});

describe("fuseJobTable", () => {
  const pipeline = [
    {
      job_id: "j1",
      job_title: "Backend Engineer",
      total_applications: 100,
      viewed: 40,
      shortlisted: 25,
      hired: 1,
      rejected: 10,
      hire_rate_pct: 1,
    },
    {
      job_id: "j2",
      job_title: "Data Engineer",
      total_applications: 4,
      viewed: 0,
      shortlisted: 0,
      hired: 0,
      rejected: 0,
      hire_rate_pct: 0,
    },
  ];

  it("uses the server's totals rather than counting a page of rows", () => {
    const t = fuseJobTable(pipeline, [], {});
    expect(t.find((r) => r.jobId === "j1")?.applicants).toBe(100);
  });

  it("derives apply-to-interview from shortlisted, not from a sample", () => {
    expect(fuseJobTable(pipeline, [], {}).find((r) => r.jobId === "j1")?.applyToInterview).toBe(25);
  });

  it("names sourcing, not the bar, when too few people have arrived", () => {
    // Sending a recruiter to widen sourcing when the rubric is the problem — or
    // to recalibrate the rubric when nobody has applied — wastes weeks. The
    // category has to be right, not just the tone.
    const d = fuseJobTable(pipeline, [], {}).find((r) => r.jobId === "j2")?.diagnosis;
    expect(d?.ailment).toBe("sourcing");
    expect(d?.text).toMatch(/sourcing/i);
  });

  it("names the bar when applicants arrive in volume but none clear it", () => {
    const stuck = [
      {
        job_id: "j3",
        job_title: "Data",
        total_applications: 96,
        viewed: 40,
        shortlisted: 0,
        hired: 0,
      },
    ];
    const d = fuseJobTable(stuck, [], {})[0].diagnosis;
    expect(d.ailment).toBe("bar");
    expect(d.tone).toBe("bad");
  });

  it("names process when people are arriving and nobody has looked", () => {
    const unread = [
      {
        job_id: "j4",
        job_title: "QA",
        total_applications: 201,
        viewed: 0,
        shortlisted: 0,
        hired: 0,
      },
    ];
    expect(fuseJobTable(unread, [], {})[0].diagnosis.ailment).toBe("process");
  });

  it("calls a job without an approved rubric unusable rather than diagnosing it", () => {
    // The other columns measured nothing, so reading them as a pipeline problem
    // would be a confident conclusion drawn from noise.
    const d = fuseJobTable(pipeline, [], {}, {}, { j1: false })[0].diagnosis;
    expect(d.ailment).toBe("unusable");
    expect(d.text).toMatch(/no rubric/i);
  });

  it("carries a clear-rate through when scores are known, and null when not", () => {
    const t = fuseJobTable(pipeline, [], {}, { j1: 22 });
    expect(t.find((r) => r.jobId === "j1")?.clearRate).toBe(22);
    expect(t.find((r) => r.jobId === "j2")?.clearRate).toBeNull();
  });

  it("carries days open through from the jobs payload when available", () => {
    const t = fuseJobTable(pipeline, [], { j1: 34 });
    expect(t.find((r) => r.jobId === "j1")?.daysOpen).toBe(34);
    expect(t.find((r) => r.jobId === "j2")?.daysOpen).toBeNull();
  });

  it("attaches the time-to-hire the view measured for that job", () => {
    const t = fuseJobTable(pipeline, [{ job_id: "j1", avg_days_to_hire: 41, hired_count: 1 }], {});
    expect(t.find((r) => r.jobId === "j1")?.avgDaysToHire).toBe(41);
    expect(t.find((r) => r.jobId === "j2")?.avgDaysToHire).toBeNull();
  });

  it("sorts the busiest jobs first, so the list opens on what matters", () => {
    expect(fuseJobTable(pipeline, [], {})[0].jobId).toBe("j1");
  });
});

describe("periodParams", () => {
  const now = Date.parse("2026-07-30T00:00:00Z");

  it("sends from and to that the v1 endpoints already understand", () => {
    const p = periodParams(resolvePeriod("this_fy", now));
    expect(p.from).toBe("2026-04-01");
    expect(p.to).toBe("2027-04-01");
  });

  it("sends nothing for all time, so the server applies no window", () => {
    expect(periodParams(resolvePeriod("all_time", now))).toEqual({});
  });

  it("maps last quarter to real calendar dates", () => {
    // From 30 Jul 2026 the current quarter is Jul–Sep, so last quarter is
    // Apr–Jun — not Jan–Mar, which is two quarters back.
    const p = periodParams(resolvePeriod("last_quarter", now));
    expect(p.from).toBe("2026-04-01");
    expect(p.to).toBe("2026-07-01");
  });
});

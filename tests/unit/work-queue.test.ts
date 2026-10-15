import { describe, expect, it } from "vitest";
import { buildQueue, queueEntry } from "@/lib/work/queue";

const counts = (
  o: Partial<{ applicants: number; awaitingReview: number; unscored: number }> = {},
) => ({
  applicants: 0,
  awaitingReview: 0,
  unscored: 0,
  clearingBar: 0,
  ...o,
});

describe("work queue", () => {
  it("puts applicants scored without a rubric first", () => {
    const q = buildQueue([
      {
        id: "a",
        title: "A",
        status: "open",
        rubricApproved: true,
        counts: counts({ applicants: 5, awaitingReview: 5 }),
      },
      {
        id: "b",
        title: "B",
        status: "open",
        rubricApproved: false,
        counts: counts({ applicants: 3 }),
      },
      { id: "c", title: "C", status: "draft", rubricApproved: false, counts: null },
    ]);
    expect(q.needsYou.map((e) => e.id)).toEqual(["b", "a", "c"]);
  });

  it("leaves jobs the system is handling out of the needs-you list", () => {
    const q = buildQueue([
      {
        id: "a",
        title: "A",
        status: "open",
        rubricApproved: true,
        counts: counts({ applicants: 4, unscored: 4 }),
      },
      { id: "b", title: "B", status: "open", rubricApproved: true, counts: counts() },
    ]);
    expect(q.needsYou).toHaveLength(0);
    expect(q.moving.map((e) => e.line)).toEqual(["Agent scoring 4", "Collecting applications"]);
  });

  it("describes review counts in plain words", () => {
    expect(
      queueEntry({
        id: "a",
        title: "A",
        status: "open",
        rubricApproved: true,
        counts: counts({ applicants: 1, awaitingReview: 1 }),
      }).line,
    ).toBe("1 candidate to review");
  });
});

describe("grouping what needs you", () => {
  it("groups like with like, most urgent first, and totals the candidates", async () => {
    const { buildQueue, groupNeedsYou } = await import("@/lib/work/queue");
    const counts = (awaitingReview: number, applicants = awaitingReview) => ({
      applicants,
      awaitingReview,
      unscored: 0,
    });
    const q = buildQueue([
      { id: "r1", title: "QA", status: "open", rubricApproved: true, counts: counts(51) as never },
      { id: "r2", title: "BE", status: "open", rubricApproved: true, counts: counts(1) as never },
      { id: "d1", title: "Pilot", status: "draft", rubricApproved: false, counts: null },
      {
        id: "x1",
        title: "Ops",
        status: "open",
        rubricApproved: false,
        counts: counts(0, 4) as never,
      },
    ]);
    const groups = groupNeedsYou(q.needsYou);
    expect(groups.map((g) => g.kind)).toEqual(["no_rubric", "review", "publish"]);
    expect(groups[1].summary).toBe("52 candidates across 2 jobs");
    expect(groups[2].summary).toBe("1 job");
  });
});

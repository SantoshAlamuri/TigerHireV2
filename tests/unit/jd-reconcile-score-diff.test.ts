import { describe, expect, it } from "vitest";
import {
  computeJdReconcileScoreDiffs,
  formatJdReconcileNotificationBody,
} from "@/lib/fitscore/jd-reconcile-score-diff";

describe("jd reconcile score diff", () => {
  it("includes only candidates whose verdict changed", () => {
    const before = new Map([
      [
        "c1",
        {
          candidate_id: "c1",
          ideal_match_pct: 72,
          verdict: "Strong Hire",
          candidates: { full_name: "Alice Kumar" },
        },
      ],
      [
        "c2",
        {
          candidate_id: "c2",
          ideal_match_pct: 55,
          verdict: "Safe Hire",
          candidates: { full_name: "Bob Singh" },
        },
      ],
    ]);
    const after = new Map([
      [
        "c1",
        {
          candidate_id: "c1",
          ideal_match_pct: 60,
          verdict: "Safe Hire",
          candidates: { full_name: "Alice Kumar" },
        },
      ],
      [
        "c2",
        {
          candidate_id: "c2",
          ideal_match_pct: 58,
          verdict: "Safe Hire",
          candidates: { full_name: "Bob Singh" },
        },
      ],
    ]);

    const diffs = computeJdReconcileScoreDiffs(before, after);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({
      candidate_name: "Alice Kumar",
      old_verdict: "Strong Hire",
      new_verdict: "Safe Hire",
      old_score: 72,
      new_score: 60,
      direction: "declined",
    });
  });

  it("formats notification with verdict changes and unchanged summary", () => {
    const body = formatJdReconcileNotificationBody({
      jobTitle: "QA Engineer",
      scoredCount: 47,
      failedCount: 0,
      verdictChanges: [
        {
          candidate_id: "c1",
          candidate_name: "Alice Kumar",
          old_verdict: "Strong Hire",
          new_verdict: "Safe Hire",
          old_score: 72,
          new_score: 60,
          direction: "declined",
        },
        {
          candidate_id: "c2",
          candidate_name: "Bob Singh",
          old_verdict: "Safe Hire",
          new_verdict: "Strong Hire",
          old_score: 58,
          new_score: 66,
          direction: "improved",
        },
      ],
    });

    expect(body).toContain("JD Base approved for QA Engineer. 47 candidates re-scored.");
    expect(body).toContain("Verdict changes (2):");
    expect(body).toContain("Alice Kumar: Strong Hire → Safe Hire (-12)");
    expect(body).toContain("Bob Singh: Safe Hire → Strong Hire (+8)");
    expect(body).toContain("45 candidates unchanged.");
  });
});

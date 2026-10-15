import { describe, it, expect } from "vitest";
import {
  createQueue,
  move,
  decide,
  toggleSelect,
  selectRange,
  bulkDecide,
  undoLast,
  lastHoldUndoIds,
  remaining,
  currentItem,
  REJECT_REASONS,
  type QueueItem,
} from "@/lib/v2/review-queue";

/**
 * Application Review is where 380 CVs get cleared, so the entire design brief is
 * "fewest possible clicks". Vendor critique: ~half of Greenhouse complaints are
 * about click count, and Ashby is criticised for throttling bulk actions. These
 * tests are the guardrail against us shipping the same failures.
 *
 * Rules encoded here:
 *  - deciding always advances, so one keystroke = one candidate cleared
 *  - bulk has no cap
 *  - reject always carries a reason (feeds the fairness report + talent pool)
 *  - hold is durably undoable; shortlist/reject stay put until notification-safe undo exists
 */
function items(n: number): QueueItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i + 1}`,
    name: `Candidate ${i + 1}`,
    score: 90 - i,
  }));
}

describe("review queue — navigation", () => {
  it("starts on the first candidate", () => {
    const q = createQueue(items(5));
    expect(currentItem(q)?.id).toBe("c1");
    expect(remaining(q)).toBe(5);
  });

  it("moves forward and back", () => {
    let q = createQueue(items(3));
    q = move(q, 1);
    expect(currentItem(q)?.id).toBe("c2");
    q = move(q, -1);
    expect(currentItem(q)?.id).toBe("c1");
  });

  it("does not run off either end", () => {
    let q = createQueue(items(2));
    q = move(q, -1);
    expect(currentItem(q)?.id).toBe("c1");
    q = move(move(q, 1), 1);
    expect(currentItem(q)?.id).toBe("c2");
  });

  it("survives an empty queue without throwing", () => {
    const q = createQueue([]);
    expect(currentItem(q)).toBeNull();
    expect(remaining(q)).toBe(0);
    expect(() => move(q, 1)).not.toThrow();
  });
});

describe("review queue — deciding is one keystroke", () => {
  it("auto-advances after a decision so the next candidate is already up", () => {
    let q = createQueue(items(3));
    q = decide(q, "advance");
    expect(currentItem(q)?.id).toBe("c2");
    expect(remaining(q)).toBe(2);
  });

  it("records the decision against the right candidate", () => {
    let q = createQueue(items(2));
    q = decide(q, "advance");
    expect(q.decisions).toEqual([{ id: "c1", decision: "advance", reason: null }]);
  });

  it("requires a reason to reject, and refuses the decision without one", () => {
    const q = createQueue(items(2));
    expect(() => decide(q, "reject")).toThrow(/reason/i);
  });

  it("accepts a reject with a reason and files it", () => {
    let q = createQueue(items(2));
    q = decide(q, "reject", "compensation");
    expect(q.decisions[0]).toEqual({ id: "c1", decision: "reject", reason: "compensation" });
  });

  it("rejects an unknown reason rather than storing junk the report can't group", () => {
    const q = createQueue(items(2));
    expect(() => decide(q, "reject", "because i said so")).toThrow(/reason/i);
  });

  it("offers reasons that map to real recruiter outcomes", () => {
    expect(REJECT_REASONS.map((r) => r.id)).toEqual([
      "experience",
      "compensation",
      "location",
      "skills",
      "other",
    ]);
    // Every reason must be poolable or not, explicitly — that drives re-engagement.
    expect(REJECT_REASONS.every((r) => typeof r.poolable === "boolean")).toBe(true);
    // Compensation and location are circumstantial: those people stay reusable.
    expect(REJECT_REASONS.find((r) => r.id === "compensation")?.poolable).toBe(true);
    expect(REJECT_REASONS.find((r) => r.id === "location")?.poolable).toBe(true);
  });

  it("holds without deciding, and still advances", () => {
    let q = createQueue(items(2));
    q = decide(q, "hold");
    expect(currentItem(q)?.id).toBe("c2");
    expect(q.decisions[0].decision).toBe("hold");
  });

  it("never decides the same candidate twice", () => {
    let q = createQueue(items(2));
    q = decide(q, "advance");
    q = move(q, -1);
    q = decide(q, "advance");
    expect(q.decisions.filter((d) => d.id === "c1")).toHaveLength(1);
  });
});

describe("review queue — bulk, with no cap", () => {
  it("selects and deselects", () => {
    let q = createQueue(items(4));
    q = toggleSelect(q, "c2");
    expect(q.selected).toContain("c2");
    q = toggleSelect(q, "c2");
    expect(q.selected).not.toContain("c2");
  });

  it("shift-selects a range, because clicking 30 boxes is the complaint", () => {
    let q = createQueue(items(10));
    q = toggleSelect(q, "c2");
    q = selectRange(q, "c2", "c6");
    expect(q.selected).toEqual(["c2", "c3", "c4", "c5", "c6"]);
  });

  it("applies one decision to any number of candidates — no limit", () => {
    let q = createQueue(items(500));
    q = q.items.reduce((acc, it) => toggleSelect(acc, it.id), q);
    q = bulkDecide(q, "reject", "compensation");
    expect(q.decisions).toHaveLength(500);
    expect(remaining(q)).toBe(0);
  });

  it("enforces the reason rule in bulk too", () => {
    let q = createQueue(items(3));
    q = toggleSelect(q, "c1");
    expect(() => bulkDecide(q, "reject")).toThrow(/reason/i);
  });

  it("clears the selection after acting", () => {
    let q = createQueue(items(3));
    q = toggleSelect(q, "c1");
    q = bulkDecide(q, "advance");
    expect(q.selected).toEqual([]);
  });
});

describe("review queue — undo", () => {
  it("undoes the last decision and returns to that candidate", () => {
    let q = createQueue(items(3));
    q = decide(q, "advance");
    q = undoLast(q);
    expect(q.decisions).toHaveLength(0);
    expect(currentItem(q)?.id).toBe("c1");
    expect(remaining(q)).toBe(3);
  });

  it("undoes a whole bulk action as one step, not 50 undos", () => {
    let q = createQueue(items(50));
    q = q.items.reduce((acc, it) => toggleSelect(acc, it.id), q);
    q = bulkDecide(q, "reject", "location");
    q = undoLast(q);
    expect(q.decisions).toHaveLength(0);
    expect(remaining(q)).toBe(50);
  });

  it("is a no-op with nothing to undo", () => {
    const q = createQueue(items(2));
    expect(() => undoLast(q)).not.toThrow();
    expect(undoLast(q).decisions).toHaveLength(0);
  });

  it("exposes hold ids for durable restore and ignores shortlist or reject", () => {
    let held = decide(createQueue(items(2)), "hold");
    expect(lastHoldUndoIds(held)).toEqual(["c1"]);
    held = decide(held, "advance");
    expect(lastHoldUndoIds(held)).toBeNull();

    const rejected = decide(createQueue(items(2)), "reject", "location");
    expect(lastHoldUndoIds(rejected)).toBeNull();
  });
});

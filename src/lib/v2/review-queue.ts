/**
 * Application Review queue — pure state machine.
 *
 * Kept free of React so the rules are testable and the UI is a thin renderer.
 * Every rule here exists because of a specific failure in incumbent tools or in
 * this product:
 *
 *  - deciding auto-advances: "too many clicks" is the single most common
 *    complaint recruiters make about Greenhouse-class ATSs
 *  - bulk has no cap: Ashby is criticised for throttling bulk actions
 *  - reject always carries a structured reason: it feeds adverse-impact
 *    reporting and decides whether the person stays in the talent pool
 *  - one undo step per action, including bulk: a 50-row bulk reject must not
 *    require 50 undos
 */
export interface QueueItem {
  id: string;
  name: string;
  score: number | null;
}

export type Decision = "advance" | "hold" | "reject";

export interface RejectReason {
  id: string;
  label: string;
  /** Circumstantial rejections stay reusable for future jobs. */
  poolable: boolean;
}

export const REJECT_REASONS: readonly RejectReason[] = [
  { id: "experience", label: "Experience depth", poolable: false },
  { id: "compensation", label: "Compensation fit", poolable: true },
  { id: "location", label: "Location / relocation", poolable: true },
  { id: "skills", label: "Missing must-have skills", poolable: false },
  { id: "other", label: "Other (note required)", poolable: false },
] as const;

export interface DecisionRecord {
  id: string;
  decision: Decision;
  reason: string | null;
}

/** One user action — a single decision or a whole bulk action — for undo. */
interface HistoryEntry {
  records: DecisionRecord[];
  cursor: number;
}

export interface Queue {
  items: QueueItem[];
  cursor: number;
  decisions: DecisionRecord[];
  selected: string[];
  history: HistoryEntry[];
}

export function createQueue(items: QueueItem[]): Queue {
  return { items, cursor: 0, decisions: [], selected: [], history: [] };
}

const decidedIds = (q: Queue) => new Set(q.decisions.map((d) => d.id));

export function remaining(q: Queue): number {
  return q.items.length - q.decisions.length;
}

export function currentItem(q: Queue): QueueItem | null {
  return q.items[q.cursor] ?? null;
}

export function move(q: Queue, delta: number): Queue {
  if (q.items.length === 0) return q;
  const next = Math.min(Math.max(q.cursor + delta, 0), q.items.length - 1);
  return { ...q, cursor: next };
}

function assertReason(decision: Decision, reason?: string): string | null {
  if (decision !== "reject") return reason ?? null;
  if (!reason) {
    throw new Error("A reject needs a reason — it feeds the fairness report and the talent pool.");
  }
  if (!REJECT_REASONS.some((r) => r.id === reason)) {
    throw new Error(`Unknown reject reason "${reason}" — pick one of the defined reasons.`);
  }
  return reason;
}

/** Advance the cursor to the next candidate that has not been decided yet. */
function advanceCursor(q: Queue, decided: Set<string>): number {
  for (let i = q.cursor; i < q.items.length; i++) {
    if (!decided.has(q.items[i].id)) return i;
  }
  // Nothing ahead — fall back to the last undecided anywhere, else clamp.
  for (let i = q.items.length - 1; i >= 0; i--) {
    if (!decided.has(q.items[i].id)) return i;
  }
  return Math.min(q.cursor, Math.max(q.items.length - 1, 0));
}

export function decide(q: Queue, decision: Decision, reason?: string): Queue {
  const item = currentItem(q);
  const checked = assertReason(decision, reason);
  if (!item) return q;
  if (decidedIds(q).has(item.id)) return move(q, 1);

  const record: DecisionRecord = { id: item.id, decision, reason: checked };
  const decisions = [...q.decisions, record];
  const decided = new Set(decisions.map((d) => d.id));
  const next: Queue = {
    ...q,
    decisions,
    history: [...q.history, { records: [record], cursor: q.cursor }],
  };
  return { ...next, cursor: advanceCursor({ ...next, cursor: q.cursor + 1 }, decided) };
}

export function toggleSelect(q: Queue, id: string): Queue {
  const selected = q.selected.includes(id)
    ? q.selected.filter((s) => s !== id)
    : [...q.selected, id];
  return { ...q, selected };
}

/** Shift-click behaviour: select everything between two ids, inclusive. */
export function selectRange(q: Queue, fromId: string, toId: string): Queue {
  const a = q.items.findIndex((i) => i.id === fromId);
  const b = q.items.findIndex((i) => i.id === toId);
  if (a === -1 || b === -1) return q;
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  const ids = q.items.slice(lo, hi + 1).map((i) => i.id);
  const merged = [...q.selected];
  for (const id of ids) if (!merged.includes(id)) merged.push(id);
  // Preserve queue order so the UI and the tests read predictably.
  const order = new Map(q.items.map((it, idx) => [it.id, idx]));
  merged.sort((x, y) => (order.get(x) ?? 0) - (order.get(y) ?? 0));
  return { ...q, selected: merged };
}

export function bulkDecide(q: Queue, decision: Decision, reason?: string): Queue {
  const checked = assertReason(decision, reason);
  const already = decidedIds(q);
  const records: DecisionRecord[] = q.selected
    .filter((id) => !already.has(id))
    .map((id) => ({ id, decision, reason: checked }));
  if (records.length === 0) return { ...q, selected: [] };

  const decisions = [...q.decisions, ...records];
  const decided = new Set(decisions.map((d) => d.id));
  const next: Queue = {
    ...q,
    decisions,
    selected: [],
    history: [...q.history, { records, cursor: q.cursor }],
  };
  return { ...next, cursor: advanceCursor(next, decided) };
}

export function undoLast(q: Queue): Queue {
  const last = q.history[q.history.length - 1];
  if (!last) return q;
  const undone = new Set(last.records.map((r) => r.id));
  return {
    ...q,
    decisions: q.decisions.filter((d) => !undone.has(d.id)),
    history: q.history.slice(0, -1),
    cursor: last.cursor,
  };
}

/**
 * IDs from the last action when it was hold-only. Shortlist and reject are
 * not returned: restoring those would notify candidates or reverse payouts.
 */
export function lastHoldUndoIds(q: Queue): string[] | null {
  const last = q.history[q.history.length - 1];
  if (!last || last.records.length === 0) return null;
  if (last.records.some((r) => r.decision !== "hold")) return null;
  return last.records.map((r) => r.id);
}

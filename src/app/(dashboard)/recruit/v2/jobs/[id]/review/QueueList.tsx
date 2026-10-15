"use client";

import type { QueueItem } from "@/lib/v2/review-queue";
import type { FlagPips } from "@/lib/v2/score-panel";

/**
 * The queue sidebar and the bulk action bar.
 *
 * Bulk deliberately has no cap: reviewers name that limitation as a specific
 * frustration in competing tools, and 380 CVs is exactly when you need it.
 */
export function QueueList({
  items,
  cursor,
  decidedIds,
  selected,
  onToggle,
  onOpen,
  pipsFor,
}: {
  items: QueueItem[];
  cursor: number;
  decidedIds: string[];
  selected: string[];
  onToggle: (id: string) => void;
  onOpen?: (id: string) => void;
  /** Flag counts per row, so the shape of a candidate reads before opening them. */
  pipsFor: (id: string) => FlagPips;
}) {
  return (
    <ol className="hidden max-h-[calc(100vh-12rem)] h-fit overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 lg:block">
      <li className="grid grid-cols-[1.25rem_1.5rem_minmax(0,1fr)_4.6rem] items-center gap-2 border-b border-white/5 bg-white/[0.02] px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
        <span />
        <span className="text-right">Fit</span>
        <span>Candidate</span>
        <span className="text-right" title="Evidence for / verify in interview / gaps">
          Signals
        </span>
      </li>
      {items.map((it, idx) => {
        const done = decidedIds.includes(it.id);
        const active = idx === cursor;
        return (
          <li
            key={it.id}
            className={`flex items-center gap-2 border-b border-white/5 px-3 py-2 text-sm last:border-b-0 ${
              active ? "bg-[var(--accent)]/10" : ""
            } ${done ? "opacity-35" : ""}`}
          >
            <input
              type="checkbox"
              checked={selected.includes(it.id)}
              disabled={done}
              onChange={() => onToggle(it.id)}
              aria-label={`Select ${it.name}`}
              className="h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
            />
            <span className="w-6 text-right font-mono font-semibold tabular-nums text-[var(--text-muted)]">
              {it.score ?? "—"}
            </span>
            <button
              type="button"
              onClick={() => onOpen?.(it.id)}
              title={it.name}
              className="min-w-0 flex-1 truncate text-left text-[var(--text-muted)]"
              aria-current={active ? "true" : undefined}
            >
              {it.name}
            </button>
            {(() => {
              const p = pipsFor(it.id);
              return (
                <span className="flex shrink-0 gap-0.5 font-mono text-xs tabular-nums">
                  <span
                    className="rounded-sm bg-emerald-500/15 px-1 leading-4 text-emerald-300"
                    title="Evidence for"
                  >
                    {p.green}
                  </span>
                  <span
                    className="rounded-sm bg-amber-500/15 px-1 leading-4 text-amber-300"
                    title="Verify in interview"
                  >
                    {p.amber}
                  </span>
                  <span
                    className="rounded-sm bg-red-500/15 px-1 leading-4 text-red-300"
                    title="Gaps"
                  >
                    {p.red}
                  </span>
                </span>
              );
            })()}
          </li>
        );
      })}
    </ol>
  );
}

export function BulkBar({
  count,
  onAdvance,
  onHold,
  onReject,
  onClear,
}: {
  count: number;
  onAdvance: () => void;
  onHold: () => void;
  onReject: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/[0.07] px-3 py-2">
      <span className="text-sm font-semibold text-[var(--text)]">{count} selected</span>
      <button
        type="button"
        onClick={onAdvance}
        className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-black"
      >
        Advance all
      </button>
      <button
        type="button"
        onClick={onHold}
        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)]"
      >
        Hold all
      </button>
      <button
        type="button"
        onClick={onReject}
        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)]"
      >
        Reject all…
      </button>
      <button
        type="button"
        onClick={onClear}
        className="ml-auto text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        Clear
      </button>
    </div>
  );
}

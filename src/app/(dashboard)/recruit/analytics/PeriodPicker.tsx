"use client";

import { PERIODS, type PeriodKey } from "@/lib/v2/period";

/**
 * The reporting window: a dropdown of the ranges a talent leader reports on,
 * plus an explicit custom range.
 *
 * A row of ten pills spent the screen's whole top edge on a control that gets
 * touched once a session. The active range is restated next to the numbers
 * regardless, because a metric read without its window is the one that gets
 * quoted wrongly.
 */
export function PeriodPicker({
  value,
  onChange,
  from,
  to,
  onFrom,
  onTo,
  invalid,
}: {
  value: PeriodKey;
  onChange: (k: PeriodKey) => void;
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  invalid: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="analytics-period">
        Reporting period
      </label>
      <select
        id="analytics-period"
        value={value}
        onChange={(e) => onChange(e.target.value as PeriodKey)}
        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] outline-none focus:border-[var(--accent)]"
      >
        {PERIODS.map((p) => (
          <option key={p.key} value={p.key}>
            {p.short}
          </option>
        ))}
      </select>

      {value === "custom" ? (
        <span className="flex flex-wrap items-center gap-1.5">
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => onFrom(e.target.value)}
            aria-label="From date"
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]"
          />
          <span className="text-xs text-white/35">to</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => onTo(e.target.value)}
            aria-label="To date"
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]"
          />
          {invalid ? (
            // Says which range is actually in force. Falling back silently would
            // show all-time numbers under a custom-range heading.
            <span className="text-[11px] text-amber-300">
              Pick an end date after the start date — showing all time until then
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

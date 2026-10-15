"use client";

import { useState } from "react";
import { Download } from "lucide-react";

const ACTION_CLASS =
  "inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-white/[0.04]";

function monthOptions(now: Date, count = 12): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push({
      value: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }),
    });
  }
  return out;
}

function rangeFor(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 1));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/**
 * The finance deliverable: one month of referral bonuses TigerHire already paid
 * on this company's jobs, with the payout-run and payment references to
 * reconcile against the invoice.
 */
export function StatementDownload() {
  const options = monthOptions(new Date());
  const [month, setMonth] = useState(options[0]?.value ?? "");
  const { from, to } = rangeFor(month || options[0].value);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="statement-month" className="mb-1 block text-xs font-medium text-white/50">
          Statement period
        </label>
        <select
          id="statement-month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <a
        href={`/api/referrals/statement?from=${from}&to=${to}`}
        target="_blank"
        rel="noopener noreferrer"
        className={ACTION_CLASS}
      >
        <Download size={16} />
        Download statement CSV
      </a>
    </div>
  );
}

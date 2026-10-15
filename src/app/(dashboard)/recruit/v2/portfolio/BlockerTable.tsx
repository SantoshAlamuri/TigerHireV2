"use client";

import Link from "next/link";
import type { PortfolioRow } from "@/lib/v2/ta-portfolio";

/**
 * Where each job is stuck, and whose name is on it.
 *
 * The Owner column read "unassigned" on every row of every org, because the
 * page had no source of owner names at all — `jobs.hiring_manager_id` points at
 * `auth.users`, which no embed resolves. The name is resolved server-side now;
 * "unassigned" here means the job genuinely has no hiring manager, which is a
 * finding rather than a rendering gap.
 */
export function BlockerTable({ rows }: { rows: PortfolioRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className="border-b border-[var(--border)] text-left">
            <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-white/40">
              Job
            </th>
            <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-white/40">
              Days
            </th>
            <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-white/40">
              Stuck at
            </th>
            <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-white/40">
              Owner
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.jobId} className="border-b border-white/5 last:border-b-0">
              <td className="px-3 py-2 text-sm font-semibold">
                <Link
                  href={`/recruit/jobs/${r.jobId}`}
                  className="text-[var(--text)] hover:text-[var(--accent)]"
                >
                  {r.jobTitle}
                </Link>
              </td>
              <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-white/60">
                {r.daysOpen ?? "—"}
              </td>
              <td className="px-3 py-2 text-sm">
                <span
                  className={
                    r.blocker.severity === "critical"
                      ? "text-red-300"
                      : r.blocker.severity === "warning"
                        ? "text-amber-300"
                        : "text-white/50"
                  }
                >
                  {r.blocker.label}
                </span>
                <span className="block text-xs text-white/40">{r.blocker.detail}</span>
              </td>
              <td
                className={`px-3 py-2 text-sm ${
                  r.owner === "unassigned" ? "text-amber-300/70" : "text-white/60"
                }`}
              >
                {r.owner}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

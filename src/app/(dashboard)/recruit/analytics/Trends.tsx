"use client";

import { useMemo } from "react";
import { applicationsPerWeek, stageVelocity, type VelRow } from "@/lib/v2/analytics-trends";
import { STATUS } from "@/lib/v2/viz";

/**
 * Trends — volume over time and how long each stage takes now versus the
 * quarter before.
 *
 * Three of the stage rows read "not recorded yet" rather than showing a
 * number. That is the honest state: `applications` carries no stage-transition
 * history, so screened→interview and interview→offer durations do not exist
 * anywhere to be measured. Printing a plausible figure there would be a
 * fabricated process metric in the one table a hiring review uses to decide
 * where the process is slow.
 */
export interface TrendRow extends VelRow {
  createdAt: string | null;
}

function Chart({
  title,
  data,
  unit,
}: {
  title: string;
  data: { label: string; value: number | null }[];
  unit?: string;
}) {
  const values = data.map((d) => d.value ?? 0);
  const max = Math.max(1, ...values);
  const measured = data.some((d) => d.value !== null);
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-4">
      <h4 className="text-sm font-bold text-[var(--text)]">{title}</h4>
      {!measured ? (
        <p className="mt-3 text-xs text-white/40">Nothing to plot yet.</p>
      ) : (
        <div className="mt-3 flex h-24 items-end gap-1">
          {data.map((d) => (
            <div
              key={d.label}
              className="flex flex-1 flex-col items-center gap-1"
              title={`${d.label}: ${d.value ?? "—"}`}
            >
              <span
                className="w-full rounded-t bg-[var(--accent)]/60"
                style={{
                  height: `${Math.round(((d.value ?? 0) / max) * 100)}%`,
                  minHeight: d.value ? 2 : 0,
                }}
              />
              <span className="text-[9px] tabular-nums text-white/30">{d.label}</span>
            </div>
          ))}
        </div>
      )}
      {measured ? (
        <p className="mt-2 text-[11px] text-white/45">
          Peak {max}
          {unit ? ` ${unit}` : ""}
        </p>
      ) : null}
    </div>
  );
}

export function Trends({ rows }: { rows: TrendRow[] }) {
  const now = useMemo(() => Date.now(), []);

  const weeks = useMemo(() => applicationsPerWeek(rows, 8, now), [rows, now]);
  const velocity = useMemo(() => stageVelocity(rows, now), [rows, now]);

  // Median time to fill, month by month, from the hires themselves.
  const fillByMonth = useMemo(() => {
    const buckets = new Map<string, number[]>();
    for (const r of rows) {
      if (r.status !== "hired" || !r.createdAt || !r.decidedAt) continue;
      const a = Date.parse(r.createdAt);
      const b = Date.parse(r.decidedAt);
      if (Number.isNaN(a) || Number.isNaN(b) || b < a) continue;
      const key = new Date(b).toISOString().slice(0, 7);
      const list = buckets.get(key) ?? [];
      list.push(Math.round((b - a) / 86_400_000));
      buckets.set(key, list);
    }
    return [...buckets.entries()].sort().map(([month, days]) => ({
      label: month.slice(5),
      value: [...days].sort((x, y) => x - y)[Math.floor(days.length / 2)],
    }));
  }, [rows]);

  const hiresByMonth = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const r of rows) {
      if (r.status !== "hired" || !r.decidedAt) continue;
      const t = Date.parse(r.decidedAt);
      if (Number.isNaN(t)) continue;
      const key = new Date(t).toISOString().slice(0, 7);
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return [...buckets.entries()].sort().map(([m, n]) => ({ label: m.slice(5), value: n }));
  }, [rows]);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <Chart
          title="Applications per week"
          data={weeks.map((w) => ({ label: w.week.slice(5), value: w.count }))}
        />
        <Chart title="Median time to fill" data={fillByMonth} unit="days" />
        <Chart title="Hires vs plan" data={hiresByMonth} />
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-4">
          <h4 className="text-sm font-bold text-[var(--text)]">Offer acceptance</h4>
          <p className="mt-3 text-xs text-white/40">
            Needs offers with a decision date. Nothing to plot until offers are being sent from
            here.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
        <table className="w-full min-w-[560px]">
          <thead>
            <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-white/40">
              <th className="px-4 py-2 text-left font-medium">Stage</th>
              <th className="px-4 py-2 text-right font-medium">Median days now</th>
              <th className="px-4 py-2 text-right font-medium">Last quarter</th>
              <th className="px-4 py-2 text-right font-medium">Δ</th>
              <th className="px-4 py-2 text-left font-medium">Driver</th>
            </tr>
          </thead>
          <tbody>
            {velocity.map((v) => (
              <tr key={v.stage} className="border-b border-white/5 last:border-b-0">
                <td className="px-4 py-2 text-sm text-[var(--text)]">{v.stage}</td>
                <td className="px-4 py-2 text-right font-mono text-sm tabular-nums text-white/85">
                  {v.now ?? <span className="text-white/25">—</span>}
                </td>
                <td className="px-4 py-2 text-right font-mono text-sm tabular-nums text-white/55">
                  {v.prior ?? <span className="text-white/25">—</span>}
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs tabular-nums">
                  {v.now === null || v.prior === null || v.prior === 0 ? (
                    <span className="text-white/20">—</span>
                  ) : (
                    (() => {
                      const d = Math.round(((v.now - v.prior) / v.prior) * 100);
                      // Faster is better for a stage duration, so a fall is good.
                      return (
                        <span
                          style={{
                            color: d < 0 ? STATUS.good : d > 0 ? STATUS.critical : undefined,
                          }}
                        >
                          {d > 0 ? "+" : ""}
                          {d}%
                        </span>
                      );
                    })()
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-white/50">{v.driver}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

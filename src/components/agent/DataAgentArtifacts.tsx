"use client";

/**
 * Presentational renderers for read-only data-agent artifacts. Every number
 * shown here comes straight from the artifact the API returned (which is built
 * only from real DB rows) — this component computes nothing but bar widths.
 */

import type { Artifact } from "@/lib/agents/data-agent/tools";

function fmtInt(n: number): string {
  return n.toLocaleString();
}

function fmtRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 truncate text-sm text-white/60" title={label}>
        {label}
      </span>
      <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-white/[0.04] ring-1 ring-inset ring-white/[0.06]">
        <div
          className="h-full rounded-md bg-[var(--accent,#6366f1)]/70"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums text-[var(--text)]">
        {fmtInt(value)}
      </span>
    </div>
  );
}

export default function DataAgentArtifacts({ artifact }: { artifact: Artifact }) {
  if (artifact.type === "source_bars") {
    if (artifact.items.length === 0) {
      return <EmptyArtifact title={artifact.title} />;
    }
    const max = Math.max(...artifact.items.map((i) => i.count), 0);
    return (
      <ArtifactCard title={artifact.title}>
        <div className="flex flex-col gap-2">
          {artifact.items.map((item) => (
            <Bar key={item.source} label={item.source} value={item.count} max={max} />
          ))}
        </div>
      </ArtifactCard>
    );
  }

  if (artifact.type === "funnel") {
    if (artifact.jobs.length === 0) {
      return <EmptyArtifact title={artifact.title} />;
    }
    return (
      <ArtifactCard title={artifact.title}>
        <div className="flex flex-col gap-5">
          {artifact.jobs.map((job) => {
            const max = Math.max(...job.stages.map((s) => s.count), 0);
            return (
              <div key={job.jobId} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-semibold text-[var(--text)]">
                    {job.jobTitle}
                  </span>
                  <span className="shrink-0 text-xs text-white/50">
                    Conversion {fmtRate(job.conversionRate)}
                  </span>
                </div>
                {job.stages.map((stage) => (
                  <Bar key={stage.label} label={stage.label} value={stage.count} max={max} />
                ))}
              </div>
            );
          })}
        </div>
      </ArtifactCard>
    );
  }

  // source_table
  if (artifact.rows.length === 0) {
    return <EmptyArtifact title={artifact.title} />;
  }
  return (
    <ArtifactCard title={artifact.title}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-white/50">
              <th className="py-2 pr-3 font-medium">Source</th>
              <th className="py-2 pr-3 font-medium">Job</th>
              <th className="py-2 pr-3 text-right font-medium">Applications</th>
              <th className="py-2 pr-3 text-right font-medium">Hired</th>
              <th className="py-2 text-right font-medium">Conversion</th>
            </tr>
          </thead>
          <tbody>
            {artifact.rows.map((row, i) => (
              <tr
                key={`${row.source}-${row.jobTitle ?? "all"}-${i}`}
                className="border-t border-white/[0.06]"
              >
                <td className="py-2 pr-3 text-[var(--text)]">{row.source}</td>
                <td className="py-2 pr-3 text-white/60">{row.jobTitle ?? "—"}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-[var(--text)]">
                  {fmtInt(row.count)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-[var(--text)]">
                  {fmtInt(row.hiredCount)}
                </td>
                <td className="py-2 text-right tabular-nums text-[var(--text)]">
                  {fmtRate(row.conversionRate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ArtifactCard>
  );
}

function ArtifactCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card-lifted rounded-xl p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/45">{title}</p>
      {children}
    </div>
  );
}

function EmptyArtifact({ title }: { title: string }) {
  return (
    <ArtifactCard title={title}>
      <p className="text-sm text-white/50">No data for that yet.</p>
    </ArtifactCard>
  );
}

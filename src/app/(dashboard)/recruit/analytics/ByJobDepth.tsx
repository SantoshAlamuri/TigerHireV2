"use client";

import { useMemo } from "react";
import Link from "next/link";
import { jobDiagnostics, type DiagRow } from "@/lib/v2/analytics-diagnostics";
import type { FusedJob } from "@/lib/v2/analytics-jobs";
import { Chip } from "./Chrome";

/**
 * By job — one row per requisition with a plain-language diagnosis, plus the
 * pass-through table.
 *
 * The Benchmark column compares each stage against this org's own median across
 * its jobs, and says so in the caption. The alternative reading — an industry
 * pass-through figure — would have to be invented, and would sit next to a real
 * number where a recruiter would take it for a target.
 */
export function ByJobDepth({ rows, fused }: { rows: DiagRow[]; fused: FusedJob[] }) {
  const now = useMemo(() => Date.now(), []);

  // Numbers come from the server-side pipeline view over the whole org. Best
  // source is not in that view, so it is ranked client-side — now over every
  // application in the period rather than the first hundred, which is what
  // made this column a sample dressed as a finding.
  const bestSourceByJob = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const d of jobDiagnostics(rows, now)) m.set(d.jobId, d.bestSource);
    return m;
  }, [rows, now]);

  const jobs = fused;

  const flow = useMemo(() => {
    const applicants = fused.reduce((n, j) => n + j.applicants, 0);
    const shortlisted = fused.reduce((n, j) => n + j.shortlisted, 0);
    const hired = fused.reduce((n, j) => n + j.hired, 0);
    const share = (part: number) => (applicants > 0 ? Math.round((part / applicants) * 100) : null);
    const perJob = (pick: (j: FusedJob) => number) => {
      const vals = fused
        .filter((j) => j.applicants > 0)
        .map((j) => Math.round((pick(j) / j.applicants) * 100))
        .sort((a, b) => a - b);
      if (!vals.length) return null;
      const mid = Math.floor(vals.length / 2);
      return vals.length % 2 ? vals[mid] : Math.round((vals[mid - 1] + vals[mid]) / 2);
    };
    return [
      {
        stage: "Applied → Shortlist",
        yours: share(shortlisted),
        benchmark: perJob((j) => j.shortlisted),
        read: "How selective the first pass is",
      },
      {
        stage: "Applied → Hire",
        yours: share(hired),
        benchmark: perJob((j) => j.hired),
        read: "How many applicants it takes to hire one",
      },
    ];
  }, [fused]);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
        <table className="w-full min-w-[820px]">
          <thead>
            <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-white/40">
              <th className="px-4 py-2 text-left font-medium">Job</th>
              <th className="px-3 py-2 text-right font-medium">Days open</th>
              <th className="px-3 py-2 text-right font-medium">Applicants</th>
              <th className="px-3 py-2 text-right font-medium">Clear rubric</th>
              <th className="px-3 py-2 text-right font-medium">Apply→Interview</th>
              <th className="px-3 py-2 text-right font-medium">Avg days to hire</th>
              <th className="px-3 py-2 text-left font-medium">Best source</th>
              <th className="px-4 py-2 text-left font-medium">Diagnosis</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-sm text-white/50">
                  No applications yet, so there is nothing to diagnose.
                </td>
              </tr>
            ) : (
              jobs.map((j) => (
                <tr key={j.jobId} className="border-b border-white/5 last:border-b-0">
                  <td className="px-4 py-2 text-sm text-[var(--text)]">
                    <Link href={`/recruit/jobs/${j.jobId}`} className="hover:underline">
                      {j.jobTitle || "Untitled role"}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-white/70">
                    {j.daysOpen ?? <span className="text-white/25">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-white/70">
                    {j.applicants}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-white/70">
                    {j.clearRate === null ? (
                      <span
                        className="text-white/25"
                        title="Scores not aggregated for this job yet"
                      >
                        —
                      </span>
                    ) : (
                      `${j.clearRate}%`
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-white/70">
                    {j.applyToInterview === null ? "—" : `${j.applyToInterview}%`}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-white/70">
                    {j.avgDaysToHire ?? <span className="text-white/25">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs capitalize text-white/60">
                    {bestSourceByJob.get(j.jobId)?.replace(/_/g, " ") ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    <Chip
                      tone={
                        j.diagnosis.tone === "good"
                          ? "good"
                          : j.diagnosis.tone === "bad"
                            ? "critical"
                            : j.diagnosis.tone === "warn"
                              ? "warning"
                              : "mute"
                      }
                    >
                      {j.diagnosis.text}
                    </Chip>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
        <table className="w-full min-w-[560px]">
          <thead>
            <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-white/40">
              <th className="px-4 py-2 text-left font-medium">Pass-through</th>
              <th className="px-3 py-2 text-right font-medium">Yours</th>
              <th className="px-3 py-2 text-right font-medium">Benchmark</th>
              <th className="px-4 py-2 text-left font-medium">Read</th>
            </tr>
          </thead>
          <tbody>
            {flow.map((f) => (
              <tr key={f.stage} className="border-b border-white/5 last:border-b-0">
                <td className="px-4 py-2 text-sm text-[var(--text)]">{f.stage}</td>
                <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-white/85">
                  {f.yours === null ? <span className="text-white/25">—</span> : `${f.yours}%`}
                </td>
                <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-white/55">
                  {f.benchmark === null ? (
                    <span className="text-white/25">—</span>
                  ) : (
                    `${f.benchmark}%`
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-white/50">{f.read}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-[var(--border)] px-4 py-2 text-[11px] text-white/35">
          Benchmark is your own median across your jobs — not an industry figure. TigerHire does not
          carry a benchmark dataset, and an invented one next to your real number would read as a
          target. Totals come from the org-wide pipeline report, not a sample.
        </p>
      </div>
    </div>
  );
}

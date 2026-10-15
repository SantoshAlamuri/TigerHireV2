"use client";

import { useState } from "react";
import Link from "next/link";
import { BENCHMARKS, resolveBenchmark, REQS_PER_RECRUITER_BAND } from "@/lib/v2/benchmarks";
import { SeatGate } from "../../SeatGate";

/**
 * Hiring Setup › Benchmarks — the targets analytics judges you against.
 *
 * Every metric shows the published industry figure and its source, plus the
 * org's own target if one is set. The source is on screen rather than in a
 * tooltip: a benchmark you cannot attribute is one you cannot argue with, and
 * these numbers decide whether a dashboard tells a team it is winning.
 *
 * Setting a target does not change any measurement — only what the figure is
 * compared against, and what colour it is drawn in.
 */
const METRIC_LABEL: Record<string, { name: string; unit: string; what: string }> = {
  timeToFill: {
    name: "Time to fill",
    unit: "days",
    what: "Requisition opened to offer accepted",
  },
  timeToHire: { name: "Time to hire", unit: "days", what: "First touch to offer accepted" },
  offerAcceptance: { name: "Offer acceptance", unit: "%", what: "Accepted ÷ offers decided" },
  candidateReplyRate: {
    name: "Candidate reply rate",
    unit: "%",
    what: "Replied ÷ screening messages sent",
  },
  applyToScreen: { name: "Apply → screened", unit: "%", what: "Funnel pass-through" },
  screenToShortlist: { name: "Screened → shortlist", unit: "%", what: "Funnel pass-through" },
  shortlistToInterview: { name: "Shortlist → interview", unit: "%", what: "Funnel pass-through" },
  interviewToOffer: { name: "Interview → offer", unit: "%", what: "Funnel pass-through" },
  offerToJoin: { name: "Offer → joined", unit: "%", what: "Funnel pass-through" },
};

function BenchmarksSetupPageBody() {
  const [draft, setDraft] = useState<Record<string, string>>({});
  // No fetch until org_hiring_benchmarks exists. Calling an endpoint that would
  // query a missing table returns an empty result that looks exactly like "no
  // targets set" — the same silent-empty-state failure that hid a 404 on the
  // interviews page for weeks.
  const targets: Record<string, number> = {};

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-[var(--text)]">Benchmarks &amp; targets</h1>
          <p className="text-sm text-white/55">
            Analytics compares every number against the target you set here. Each starts from a
            published default, cited below — override it and the dashboards follow.
          </p>
        </div>
        <Link
          href="/recruit/v2/setup"
          className="text-sm font-semibold text-white/60 hover:text-[var(--text)]"
        >
          ← Hiring Setup
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/30">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-[var(--border)] text-[9.5px] uppercase tracking-[0.1em] text-white/30">
                <th className="px-4 py-2.5 text-left font-semibold">Metric</th>
                <th className="px-4 py-2.5 text-right font-semibold">Your target</th>
                <th className="px-4 py-2.5 text-right font-semibold">Default</th>
                <th className="px-4 py-2.5 text-left font-semibold">
                  Where the default comes from
                </th>
                <th className="px-4 py-2.5 text-left font-semibold">In force</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(BENCHMARKS).map((key) => {
                const b = BENCHMARKS[key];
                const resolved = resolveBenchmark(key, targets);
                const meta = METRIC_LABEL[key];
                return (
                  <tr key={key} className="border-b border-white/5 last:border-b-0">
                    <td className="px-4 py-2.5">
                      <div className="text-[13px] font-semibold text-[var(--text)]">
                        {meta?.name ?? key}
                      </div>
                      <div className="text-[11px] text-white/35">{meta?.what}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <input
                        type="number"
                        min={1}
                        placeholder="—"
                        value={draft[key] ?? (targets[key] != null ? String(targets[key]) : "")}
                        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                        aria-label={`Target for ${meta?.name ?? key}`}
                        className="w-20 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-right font-mono text-[13px] tabular-nums text-[var(--text)] outline-none focus:border-[var(--accent)]"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[13px] tabular-nums text-white/45">
                      {b.value}
                      <span className="ml-0.5 text-[10px] text-white/25">{meta?.unit}</span>
                    </td>
                    <td className="px-4 py-2.5 text-[11px] leading-snug text-white/35">
                      {b.label} — {b.source}
                    </td>
                    <td className="px-4 py-2.5 text-[11px]">
                      {resolved?.isOrgTarget ? (
                        <span className="text-emerald-300">your target</span>
                      ) : (
                        <span className="text-white/35">default</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-[var(--border)] px-4 py-2.5 text-[11px] text-white/30">
          Recruiter load uses a band rather than a single figure: {REQS_PER_RECRUITER_BAND.low}–
          {REQS_PER_RECRUITER_BAND.high} open reqs per recruiter is healthy. Above that a req stops
          getting attention; below it a desk is under-used.
        </p>
      </div>

      {/* Saving needs the org_hiring_benchmarks table, which is written as a
          migration awaiting review. The control is deliberately inert and says
          so rather than accepting input it would silently drop. */}
      <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/[0.05] px-4 py-3 text-[12px] leading-relaxed text-amber-200/80">
        Targets cannot be saved yet — the table they live in (
        <code className="text-[11px]">org_hiring_benchmarks</code>) is a pending migration awaiting
        approval. Until it is applied, analytics compares against the published figures above, and
        anything typed here is not stored. The comparison logic and its tests are already in place,
        so enabling this is one migration away.
      </div>
    </section>
  );
}

export default function BenchmarksSetupPage() {
  return (
    <SeatGate need="editJobSetup" what="Benchmarks and targets">
      <BenchmarksSetupPageBody />
    </SeatGate>
  );
}

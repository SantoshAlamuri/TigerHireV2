"use client";

/**
 * Source of hire, on the Overview screen where the approved design puts it.
 *
 * Cost per hire is blank on every row. Attributing spend to a source needs
 * spend data the product does not collect, and a plausible figure in that
 * column would be quoted in a budget conversation.
 */
export function SourceTable({
  rows,
}: {
  rows: { source: string; applicants: number; hires: number; conversion: number }[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
      <table className="w-full min-w-[620px]">
        <thead>
          <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-white/40">
            <th className="px-4 py-2 text-left font-medium">Source</th>
            <th className="px-3 py-2 text-right font-medium">Applicants</th>
            <th className="px-3 py-2 text-right font-medium">Hires</th>
            <th className="px-3 py-2 text-right font-medium">Conversion</th>
            <th className="px-3 py-2 text-right font-medium">Cost / hire</th>
            <th className="px-4 py-2 text-left font-medium">Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.source} className="border-b border-white/5 last:border-b-0">
              <td className="px-4 py-2 text-sm capitalize text-[var(--text)]">
                {s.source.replace(/_/g, " ")}
              </td>
              <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-white/70">
                {s.applicants}
              </td>
              <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-white/70">
                {s.hires}
              </td>
              <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-white/85">
                {s.conversion}%
              </td>
              {/* No spend is recorded per source, so this stays a dash rather
                  than a number nobody could trace back to an invoice. */}
              <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-white/25">
                —
              </td>
              <td className="px-4 py-2 text-xs text-white/50">
                {s.hires > 0
                  ? `${s.applicants} applicants per hire`
                  : s.applicants >= 20
                    ? "High volume, no hires yet"
                    : "Too little volume to judge"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-[var(--border)] px-4 py-2 text-[11px] text-white/35">
        Cost per hire needs recruiting spend attributed to each source. TigerHire does not track
        spend yet, so it stays blank rather than showing a number you could not defend.
      </p>
    </div>
  );
}

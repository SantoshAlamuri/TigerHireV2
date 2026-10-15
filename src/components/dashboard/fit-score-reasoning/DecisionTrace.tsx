"use client";

export type DecisionTraceProps = {
  decisionStandardLabel: string;
  traceDisplay: string;
  traceCopyValue: string;
  hasProvenanceHash: boolean;
  controlsOk: boolean;
};

export function DecisionTrace({
  decisionStandardLabel,
  traceDisplay,
  traceCopyValue,
  hasProvenanceHash,
  controlsOk,
}: DecisionTraceProps) {
  return (
    <details className="border-t border-[var(--border)]/70 pt-4">
      <summary className="cursor-pointer select-none text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-subtle)] outline-none transition hover:text-[var(--text-muted)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35">
        Decision trace &amp; audit
      </summary>
      <footer className="mt-4 grid gap-5 text-[11px] sm:grid-cols-3 sm:gap-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-subtle)]">
            Decision standard
          </p>
          <p className="mt-1.5 leading-snug text-[var(--text-muted)]">{decisionStandardLabel}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-subtle)]">
            Decision trace ID
          </p>
          <button
            type="button"
            onClick={() => {
              if (!navigator?.clipboard) return;
              void navigator.clipboard.writeText(traceCopyValue);
            }}
            className="mt-1.5 w-full rounded-md px-1 py-1 text-left font-mono text-[var(--text-muted)] underline-offset-2 transition hover:bg-[var(--bg-elevated)]/80 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
            title={hasProvenanceHash ? "Copy full provenance hash" : "Copy score session id"}
          >
            {traceDisplay}
          </button>
          {hasProvenanceHash ? null : (
            <p className="mt-1 text-[10px] leading-snug text-[var(--text-subtle)]">
              Audit hash unavailable for this score row (legacy or partial record).
            </p>
          )}
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-subtle)]">
            Control status
          </p>
          <p
            className={
              controlsOk
                ? "mt-1.5 font-medium leading-snug text-emerald-400"
                : "mt-1.5 font-medium leading-snug text-amber-300"
            }
          >
            {controlsOk ? "No scoring issues detected" : "Manual review recommended"}
          </p>
        </div>
      </footer>
    </details>
  );
}

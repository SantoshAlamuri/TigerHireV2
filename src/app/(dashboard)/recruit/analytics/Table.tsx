"use client";

/** Table primitives: hairline rows, mono numerics, recessive chrome. */
export const TH =
  "px-4 py-2.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-white/30 whitespace-nowrap";
export const TD = "px-4 py-2.5 text-[13px] text-white/75";
export const TD_NUM = `${TD} text-right font-mono tabular-nums`;

export function Panel({ children, caption }: { children: React.ReactNode; caption?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/30">
      <div className="overflow-x-auto">{children}</div>
      {caption ? (
        <p className="border-t border-[var(--border)] px-4 py-2 text-[11px] text-white/30">
          {caption}
        </p>
      ) : null}
    </div>
  );
}

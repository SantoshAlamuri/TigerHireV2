"use client";

export type FlagColumnsProps = {
  strengthItems: string[];
  gapItems: string[];
};

export function FlagColumns({ strengthItems, gapItems }: FlagColumnsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 md:items-stretch md:gap-5">
      <div className="flex flex-col rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3.5 ring-1 ring-inset ring-emerald-500/10 sm:p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-400/95">
          Green flags
        </p>
        <ul className="mt-3 flex flex-1 flex-col gap-2.5 text-sm leading-snug text-[var(--text-muted)]">
          {strengthItems.map((item) => (
            <li key={`ok-${item}`} className="flex gap-2.5">
              <span
                className="mt-0.5 shrink-0 select-none font-semibold leading-none text-emerald-400"
                aria-hidden
              >
                ✓
              </span>
              <span className="min-w-0 break-words">{item}</span>
            </li>
          ))}
          {strengthItems.length === 0 ? (
            <li className="text-[var(--text-subtle)]">No strengths listed</li>
          ) : null}
        </ul>
      </div>
      <div className="flex flex-col rounded-xl border border-rose-500/25 bg-rose-500/[0.06] p-3.5 ring-1 ring-inset ring-rose-500/10 sm:p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-400/95">
          Red flags
        </p>
        {gapItems.length === 0 ? (
          <p className="mt-3 text-sm leading-snug text-[var(--text-subtle)]">No warnings or gaps</p>
        ) : (
          <>
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-400/90">
              Gaps
            </p>
            <ul className="mt-2 flex flex-col gap-2.5 text-sm leading-snug text-[var(--text-muted)]">
              {gapItems.map((item) => (
                <li key={`gap-${item}`} className="flex gap-2.5">
                  <span
                    className="mt-0.5 shrink-0 select-none font-semibold leading-none text-rose-400"
                    aria-hidden
                  >
                    ✗
                  </span>
                  <span className="min-w-0 break-words">{item}</span>
                </li>
              ))}
              {gapItems.length === 0 ? (
                <li className="text-[var(--text-subtle)]">No gaps listed</li>
              ) : null}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

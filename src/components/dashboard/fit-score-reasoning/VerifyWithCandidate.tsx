"use client";

export type VerifyWithCandidateProps = {
  items: string[];
};

export function VerifyWithCandidate({ items }: VerifyWithCandidateProps) {
  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4 ring-1 ring-inset ring-amber-500/10 sm:p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400/95">
        Verify with candidate
      </p>
      <p className="mt-1 text-[11px] leading-snug text-[var(--text-subtle)]">
        Inferred from the CV, not verified — could be a parsing artifact. Confirm before weighing
        these.
      </p>
      <ul className="mt-3 flex flex-col gap-2.5 text-sm leading-snug text-[var(--text-muted)]">
        {items.map((item) => (
          <li key={`verify-${item}`} className="flex gap-2.5">
            <span
              className="mt-0.5 shrink-0 select-none font-semibold leading-none text-amber-400"
              aria-hidden
            >
              ⚠
            </span>
            <span className="min-w-0 break-words">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

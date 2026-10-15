"use client";

import { ORDINAL } from "@/lib/v2/viz";

/** Micro-type section headings, and the reading that follows a set of numbers. */
export function SectionLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-2 mt-5 flex items-baseline gap-2 first:mt-0">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
        {children}
      </span>
      {hint ? <span className="text-[11px] text-white/25">{hint}</span> : null}
    </div>
  );
}

export function Insight({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <span
        aria-hidden
        className="mt-0.5 h-full w-[3px] shrink-0 rounded-full"
        style={{ background: ORDINAL[3] }}
      />
      <p className="text-[12.5px] leading-relaxed text-white/60">{children}</p>
    </div>
  );
}

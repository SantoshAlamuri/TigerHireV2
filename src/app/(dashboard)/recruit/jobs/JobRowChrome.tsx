"use client";

import Link from "next/link";

/**
 * One row of the jobs list, as a card.
 *
 * The row carried a trailing "Open →" while the whole row was already a link —
 * a redundant target that also read as the only clickable thing, which made the
 * rest of the row feel inert. The affordance is now the card itself: it lifts,
 * brightens and shows a left accent edge on hover, so the whole row reads as one
 * clickable object.
 */
export function JobRowChrome({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group relative flex items-center gap-4 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 px-4 py-3 transition-all duration-200 hover:-translate-y-[1px] hover:border-white/25 hover:bg-white/[0.045] hover:shadow-[0_6px_20px_-8px_rgba(0,0,0,0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
    >
      {/* Accent edge grows on hover — a direction cue without a second target. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px] scale-y-0 bg-[var(--accent)] transition-transform duration-200 group-hover:scale-y-100"
      />
      {children}
    </Link>
  );
}

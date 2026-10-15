import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";

type SetupCardProps = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

export function SetupCard({ href, title, description, icon: Icon }: SetupCardProps) {
  return (
    <Link
      href={href}
      className="group flex min-h-[140px] flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-4 shadow-sm transition hover:border-[var(--accent)]/40 hover:bg-[var(--surface)]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="inline-flex rounded-lg bg-[var(--surface)] p-2 text-[var(--accent)] ring-1 ring-[var(--border)]">
          <Icon size={20} aria-hidden />
        </span>
        <ChevronRight
          size={18}
          className="mt-1 shrink-0 text-[var(--text-subtle)] transition group-hover:translate-x-0.5 group-hover:text-[var(--text-muted)]"
          aria-hidden
        />
      </div>
      <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
      <p className="mt-1 flex-1 text-sm text-[var(--text-muted)]">{description}</p>
    </Link>
  );
}

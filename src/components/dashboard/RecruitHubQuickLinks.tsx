"use client";

import Link from "next/link";
import { BarChart3, Briefcase, CalendarClock, ListTree, Users } from "lucide-react";

const CARD =
  "group flex min-h-[44px] items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-left text-sm font-medium text-[var(--text)] transition-colors duration-200 hover:border-[var(--accent)]/45 hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/55";

const SUB = "mt-0.5 block truncate text-xs font-normal text-white/65";

/**
 * High-traffic recruiter shortlinks — aligns copy with sidebar but surfaces IA on home / jobs.
 */
export function RecruitHubQuickLinks() {
  return (
    <nav aria-label="Common recruiter tasks" className="mb-5 touch-manipulation">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/60">
        Jump to
      </p>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <Link href="/recruit/pipeline" className={CARD}>
          <ListTree className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate">Pipeline</span>
            <span className={SUB}>Stages, outcomes, bulk actions</span>
          </span>
        </Link>
        <Link href="/recruit/jobs" className={CARD}>
          <Briefcase className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate">Jobs</span>
            <span className={SUB}>Open roles and job workspace</span>
          </span>
        </Link>
        <Link href="/recruit/candidates" className={CARD}>
          <Users className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate">Candidates</span>
            <span className={SUB}>Search, FitScore, contact</span>
          </span>
        </Link>
        <Link href="/recruit/interview-prep" className={CARD}>
          <CalendarClock className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate">Interview prep</span>
            <span className={SUB}>{"Tomorrow\u2019s rounds and briefs"}</span>
          </span>
        </Link>
        <Link href="/recruit/analytics" className={CARD}>
          <BarChart3 className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate">Analytics</span>
            <span className={SUB}>Funnel, activity, reporting</span>
          </span>
        </Link>
      </div>
    </nav>
  );
}

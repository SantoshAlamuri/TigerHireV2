"use client";

import Link from "next/link";
import { filterPillClass } from "@/components/ui/filter-pill";

/**
 * List ⇄ Portfolio, as a switch on the page rather than a row of nav chrome.
 *
 * Both screens are the same set of open jobs: the list is the one you work
 * ("click a job"), the portfolio is the one you report on (owner, blocker,
 * counts). That makes Portfolio a lens on Jobs, not a sibling destination —
 * and a lens belongs in the page header next to what it changes, not in a
 * global strip under the top nav where it sat beside a settings directory.
 *
 * Rendered only for seats with `viewPortfolio`; a one-option switch is noise.
 */
export type JobsView = "list" | "portfolio";

export const JOBS_LIST_HREF = "/recruit/jobs";
export const JOBS_PORTFOLIO_HREF = "/recruit/v2/portfolio";

const VIEWS: { view: JobsView; label: string; href: string }[] = [
  { view: "list", label: "List", href: JOBS_LIST_HREF },
  { view: "portfolio", label: "Portfolio", href: JOBS_PORTFOLIO_HREF },
];

export function JobsViewSwitch({ current }: { current: JobsView }) {
  return (
    <nav aria-label="Jobs view" className="flex shrink-0 items-center gap-1.5">
      {VIEWS.map((v) => {
        const active = v.view === current;
        return (
          <Link
            key={v.view}
            href={v.href}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={`${filterPillClass(active, "sm")} shrink-0`}
          >
            {v.label}
          </Link>
        );
      })}
    </nav>
  );
}

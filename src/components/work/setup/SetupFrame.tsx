"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

/** True when the person reached this screen from the onboarding checklist. */
export function useFromWelcome(): boolean {
  return useSearchParams().get("from") === "welcome";
}

/** Keep the "came from onboarding" marker on links between setup screens. */
export function withFrom(href: string, fromWelcome: boolean): string {
  if (!fromWelcome) return href;
  return `${href}${href.includes("?") ? "&" : "?"}from=welcome`;
}

/**
 * One setup screen: where you came from, what this is, and the work. When the
 * screen was opened from onboarding, the way out goes back to the checklist,
 * which then opens on the next step.
 */
export function SetupFrame({
  sig,
  title,
  lede,
  done,
  children,
}: {
  sig: string;
  title: string;
  lede: string;
  /** Set once this screen's job is done: offers the next step instead of only "back". */
  done?: boolean;
  children: ReactNode;
}) {
  const fromWelcome = useFromWelcome();
  const back = fromWelcome ? "/work/welcome" : "/work/setup";

  return (
    <div className="wd-page">
      <Link href={back} className="wd-small wd-muted" style={{ textDecoration: "none" }}>
        ← {fromWelcome ? "Setup checklist" : "Setup"}
      </Link>
      <header className="wd-stack" style={{ gap: 14 }}>
        <span className={`wd-sig ${done ? "auto" : "you"}`}>{done ? `${sig} · done` : sig}</span>
        <h1 className="wd-h1" style={{ maxWidth: "18ch" }}>
          {title}
        </h1>
        <p className="wd-lede">{lede}</p>
      </header>
      {children}
      {fromWelcome && (
        <div className="wd-row-actions">
          <Link href="/work/welcome" className={`wd-btn ${done ? "go" : ""}`}>
            {done ? "Next step" : "Back to the checklist"}
          </Link>
        </div>
      )}
    </div>
  );
}

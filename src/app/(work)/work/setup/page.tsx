"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";
import { setupFor } from "@/lib/work/setup-sections";

/**
 * Setup: everything that isn't part of one job, in one place. Jobs still ask
 * for a missing setting at the moment they need it; this is where to change
 * things on purpose.
 */
export default function WorkSetupPage() {
  const { user } = useAuth();
  if (!user) return null;
  const sections = setupFor(user.role, Boolean(user.isOrgAdmin));

  return (
    <div className="wd-page">
      <header className="wd-stack" style={{ gap: 18 }}>
        <span className="wd-sig auto">Setup</span>
        <h1 className="wd-h1" style={{ maxWidth: "16ch" }}>
          Everything that isn&apos;t one job.
        </h1>
        <p className="wd-lede">
          Change how your team hires here. Jobs pick up the changes, and still ask you at the moment
          they need something that isn&apos;t set up.
        </p>
        <div className="wd-row-actions" style={{ gap: 4 }}>
          {user.isOrgAdmin && (
            <Link href="/work/welcome" className="wd-btn quiet">
              Setup checklist
            </Link>
          )}
          <span className="wd-small wd-muted">See onboarding as:</span>
          <Link href="/work/welcome?preview=admin" className="wd-btn quiet">
            Admin
          </Link>
          <Link href="/work/welcome?preview=user" className="wd-btn quiet">
            Recruiter
          </Link>
          <Link href="/work/welcome?preview=hm" className="wd-btn quiet">
            Hiring manager
          </Link>
        </div>
      </header>

      <div className="wd-stack" style={{ gap: 30 }}>
        {sections.map((s) => (
          <section key={s.id} id={s.id} className="wd-split" aria-labelledby={`setup-${s.id}`}>
            <div className="wd-stack" style={{ gap: 6 }}>
              <h2 id={`setup-${s.id}`} className="wd-h2">
                {s.title}
              </h2>
              <p className="wd-muted" style={{ margin: 0 }}>
                {s.why}
              </p>
            </div>
            <ul className="wd-lines" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {s.links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="wd-line"
                    style={{
                      gridTemplateColumns: "minmax(0,1fr) auto",
                      color: "inherit",
                      textDecoration: "none",
                      padding: "14px 0",
                    }}
                  >
                    <span>
                      <span style={{ display: "block", fontSize: 15 }}>{l.name}</span>
                      <span className="wd-src" style={{ display: "block" }}>
                        {l.note}
                      </span>
                    </span>
                    <span className="wd-muted" aria-hidden="true">
                      Open
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

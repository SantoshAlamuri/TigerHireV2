"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useWorkQueue } from "@/components/work/WorkShell";
import { useOnboardingHints } from "@/components/work/use-onboarding";
import { needsOnboarding, onboardingKind } from "@/lib/work/onboarding";
import { groupNeedsYou, type QueueEntry, type QueueTone } from "@/lib/work/queue";

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const SHOW = 4;

function Row({
  href,
  title,
  line,
  tone,
}: {
  href: string;
  title: string;
  line: string;
  tone: QueueTone | "idle";
}) {
  return (
    <li>
      <Link href={href} className="wd-row">
        <span className={`wd-qdot ${tone}`} aria-hidden="true" />
        <span className="wd-row-title">{title}</span>
        <span className="wd-row-line">{line}</span>
        <span className="wd-row-go" aria-hidden="true">
          →
        </span>
      </Link>
    </li>
  );
}

/** A list that shows a few and keeps the rest one press away. */
function Some<T>({
  items,
  render,
  limit = SHOW,
  noun,
}: {
  items: T[];
  render: (item: T) => React.ReactNode;
  limit?: number;
  noun: string;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, limit);
  const rest = items.length - limit;
  return (
    <>
      <ul className="wd-rows">{shown.map(render)}</ul>
      {rest > 0 && (
        <button type="button" className="wd-more" onClick={() => setAll(!all)} aria-expanded={all}>
          {all ? "Show fewer" : `Show ${rest} more ${rest === 1 ? noun : `${noun}s`}`}
        </button>
      )}
    </>
  );
}

/**
 * Home answers one question: what needs you, and where to start. One button
 * opens the most urgent job; underneath, everything else is grouped by the kind
 * of work, so a glance says how the day looks.
 */
export default function WorkHome() {
  const { user } = useAuth();
  const { queue, waiting, loading } = useWorkQueue();
  const onboarding = useOnboardingHints();
  const setupOpen =
    !!user &&
    onboardingKind(user.role, Boolean(user.isOrgAdmin)) === "admin" &&
    onboarding.ready &&
    needsOnboarding("admin", onboarding.hints);

  const first = queue.needsYou[0];
  const name = user?.name?.split(" ")[0];
  const hello = `${greeting()}${name ? `, ${name}` : ""}`;

  if (loading) {
    return (
      <div className="wd-page">
        <p role="status" className="wd-muted">
          Loading your work…
        </p>
      </div>
    );
  }

  const count = queue.needsYou.length;
  const groups = groupNeedsYou(queue.needsYou);
  const toReview = queue.needsYou
    .filter((e) => e.kind === "review")
    .reduce((sum, e) => sum + (e.count ?? 0), 0);

  return (
    <div className="wd-page wd-home">
      <header className="wd-stack" style={{ gap: 16 }}>
        <span className={`wd-sig ${first ? "you" : "auto"}`}>{hello}</span>
        <h1 className="wd-h1">
          {first
            ? count === 1
              ? "One job needs you."
              : `${count} jobs need you.`
            : "You're all clear."}
        </h1>
        <p className="wd-lede">
          {first ? (
            <>
              Start with <b style={{ color: "var(--wd-ink)", fontWeight: 400 }}>{first.title}</b> —{" "}
              {first.line.toLowerCase()}. We&apos;ll take you to the step, then on to the next job.
            </>
          ) : queue.moving.length ? (
            `The agent and automation are handling ${queue.moving.length} ${queue.moving.length === 1 ? "job" : "jobs"}. Anything that needs you comes back here.`
          ) : (
            "No open jobs yet. Start one with a few lines about the role."
          )}
        </p>
        <div className="wd-row-actions">
          {first ? (
            <Link href={`/work/jobs/${first.id}`} className="wd-btn go" autoFocus>
              Start
            </Link>
          ) : null}
          <Link href="/work/new" className={`wd-btn ${first ? "" : "go"}`}>
            New job
          </Link>
        </div>
      </header>

      {(count > 0 || queue.moving.length > 0 || waiting.length > 0) && (
        <dl className="wd-numbers wd-home-numbers">
          <div className="wd-number">
            <dt>Need you</dt>
            <dd>{count}</dd>
          </div>
          <div className="wd-number">
            <dt>Candidates to review</dt>
            <dd>{toReview}</dd>
          </div>
          <div className="wd-number">
            <dt>Moving on their own</dt>
            <dd>{queue.moving.length}</dd>
          </div>
          <div className="wd-number">
            <dt>Waiting on approval</dt>
            <dd>{waiting.length}</dd>
          </div>
        </dl>
      )}

      {setupOpen && (
        <Link href="/work/welcome" className="wd-panel you wd-home-setup">
          <span>
            <span className="wd-sig you">Set up your team</span>
            <span className="wd-row-line" style={{ display: "block", marginTop: 6 }}>
              Calendar, team, hiring process. A few minutes, once.
            </span>
          </span>
          <span className="wd-row-go" aria-hidden="true">
            →
          </span>
        </Link>
      )}

      {groups.map((g) => (
        <section key={g.kind} className="wd-group" aria-labelledby={`g-${g.kind}`}>
          <header className="wd-group-head">
            <h2 id={`g-${g.kind}`} className="wd-h2">
              {g.title}
            </h2>
            <span className="wd-small wd-muted">{g.summary}</span>
          </header>
          <Some
            items={g.entries}
            noun="job"
            render={(e: QueueEntry) => (
              <Row
                key={e.id}
                href={`/work/jobs/${e.id}`}
                title={e.title}
                line={e.line}
                tone={e.tone}
              />
            )}
          />
        </section>
      ))}

      {(queue.moving.length > 0 || waiting.length > 0) && (
        <div className="wd-home-pair">
          {queue.moving.length > 0 && (
            <section className="wd-group" aria-labelledby="g-moving">
              <header className="wd-group-head">
                <h2 id="g-moving" className="wd-h2">
                  Moving on their own
                </h2>
                <span className="wd-small wd-muted">{queue.moving.length}</span>
              </header>
              <Some
                items={queue.moving}
                limit={3}
                noun="job"
                render={(e: QueueEntry) => (
                  <Row
                    key={e.id}
                    href={`/work/jobs/${e.id}`}
                    title={e.title}
                    line={e.line}
                    tone={e.tone}
                  />
                )}
              />
            </section>
          )}
          {waiting.length > 0 && (
            <section className="wd-group" aria-labelledby="g-waiting">
              <header className="wd-group-head">
                <h2 id="g-waiting" className="wd-h2">
                  Waiting on approval
                </h2>
                <span className="wd-small wd-muted">{waiting.length}</span>
              </header>
              <Some
                items={waiting}
                limit={3}
                noun="request"
                render={(r) => (
                  <Row
                    key={r.id}
                    href={`/work/new?request=${r.id}`}
                    title={r.title}
                    line="With the approvers"
                    tone="idle"
                  />
                )}
              />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

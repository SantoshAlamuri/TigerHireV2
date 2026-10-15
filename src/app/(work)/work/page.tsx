"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useWorkQueue } from "@/components/work/WorkShell";

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/**
 * Home is one question: what needs you, and where to start. The answer is a
 * single button that opens the most urgent job; the job takes it from there.
 */
export default function WorkHome() {
  const { user } = useAuth();
  const { queue, waiting, loading } = useWorkQueue();
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
  const moving = queue.moving.length;

  return (
    <div className="wd-page" style={{ paddingTop: "12vh" }}>
      <div className="wd-stack" style={{ gap: 18 }}>
        <span className={`wd-sig ${first ? "you" : "auto"}`}>{hello}</span>
        <h1 className="wd-h1" style={{ maxWidth: "16ch" }}>
          {first
            ? count === 1
              ? `One job needs you. Start with ${first.title}.`
              : `${count} jobs need you. Start with ${first.title}.`
            : "You're all clear."}
        </h1>
        <p className="wd-lede">
          {first
            ? `${first.line}. We'll take you straight to the step, then on to the next job when you're done.`
            : moving
              ? `The agent and automation are handling ${moving} ${moving === 1 ? "job" : "jobs"}. Anything that needs you comes back here.`
              : "No open jobs yet. Start one with a few lines about the role."}
        </p>
      </div>
      <div className="wd-row-actions">
        {first ? (
          <Link href={`/work/jobs/${first.id}`} className="wd-btn go" autoFocus>
            Start
          </Link>
        ) : (
          <Link href="/work/new" className="wd-btn go" autoFocus>
            New job
          </Link>
        )}
        {(moving > 0 || waiting.length > 0) && (
          <span className="wd-small wd-muted">
            {[
              moving ? `${moving} moving on their own` : "",
              waiting.length ? `${waiting.length} waiting on approval` : "",
            ]
              .filter(Boolean)
              .join(", ")}
          </span>
        )}
      </div>
    </div>
  );
}

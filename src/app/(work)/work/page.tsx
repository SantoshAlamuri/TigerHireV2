"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useWorkQueue } from "@/components/work/WorkShell";
import { AllClear } from "@/components/work/AllClear";

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
  const { queue, loading } = useWorkQueue();
  const first = queue.needsYou[0];
  const name = user?.name?.split(" ")[0];

  if (loading) {
    return (
      <p role="status" className="wd-muted">
        Loading your work…
      </p>
    );
  }

  if (!first) {
    return (
      <AllClear
        title={`${greeting()}${name ? `, ${name}` : ""}. You're all clear.`}
        detail={
          queue.moving.length
            ? `The agent and automation are handling ${queue.moving.length} ${queue.moving.length === 1 ? "job" : "jobs"}. We'll bring anything that needs you back here.`
            : "No open jobs yet. Start one from a hiring request."
        }
        action={
          queue.moving.length ? null : (
            <Link href="/recruit/hiring-requests" className="wd-btn go">
              Start a new job
            </Link>
          )
        }
      />
    );
  }

  const count = queue.needsYou.length;
  return (
    <section className="wd-stack" style={{ maxWidth: 720, paddingTop: "6vh" }}>
      <p className="wd-muted" style={{ margin: 0 }}>
        {greeting()}
        {name ? `, ${name}` : ""}
      </p>
      <h1 className="wd-h1">
        {count === 1 ? "One job needs you." : `${count} jobs need you.`} Start with {first.title}.
      </h1>
      <p className="wd-muted" style={{ margin: 0, maxWidth: "60ch" }}>
        {first.line}. Open it and we&apos;ll take you straight to the step, then on to the next job
        when you&apos;re done.
      </p>
      <div className="wd-row">
        <Link href={`/work/jobs/${first.id}`} className="wd-btn go" autoFocus>
          Start
        </Link>
        <span className="wd-small wd-muted">
          {queue.moving.length > 0 &&
            `${queue.moving.length} more ${queue.moving.length === 1 ? "is" : "are"} moving on their own`}
        </span>
      </div>
    </section>
  );
}

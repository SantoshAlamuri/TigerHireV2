"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useApiQuery } from "@/lib/hooks/use-api";
import { ROLE_DASHBOARD_PATH } from "@/types/database";
import { resolveDashboardRouteAccessRule } from "@/lib/security/dashboard-route-policy";
import type { JobApplicantCounts } from "@/lib/v2/ta-portfolio";
import { buildQueue, type QueueEntry } from "@/lib/work/queue";

interface PortfolioJob {
  id: string;
  title: string;
  rubricApproved: boolean;
  counts: JobApplicantCounts;
}

function TigerMark() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="var(--wd-you)" />
      <path
        d="M9 7l4 6M16 4v7M23 7l-4 6"
        stroke="var(--wd-ink)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="18" r="1.8" fill="var(--wd-ink)" />
      <circle cx="20" cy="18" r="1.8" fill="var(--wd-ink)" />
      <path
        d="M13.5 23c1.5 1.2 3.5 1.2 5 0"
        stroke="var(--wd-ink)"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The shared queue, so the job screen can offer "next job" when this one is clear. */
export function useWorkQueue() {
  const portfolio = useApiQuery<{ jobs: PortfolioJob[] }>("/api/portfolio");
  const drafts = useApiQuery<{ jobs: { id: string; title: string }[] }>("/api/jobs", {
    status: "draft",
    limit: 50,
  });
  const queue = useMemo(
    () =>
      buildQueue([
        ...(portfolio.data?.jobs ?? []).map((j) => ({
          id: j.id,
          title: j.title,
          status: "open" as const,
          rubricApproved: j.rubricApproved,
          counts: j.counts,
        })),
        ...(drafts.data?.jobs ?? []).map((j) => ({
          id: j.id,
          title: j.title,
          status: "draft" as const,
          rubricApproved: false,
          counts: null,
        })),
      ]),
    [portfolio.data, drafts.data],
  );
  return {
    queue,
    loading: portfolio.loading && !portfolio.data,
    error: portfolio.error,
    refresh: async () => {
      await Promise.all([portfolio.refetch({ silent: true }), drafts.refetch({ silent: true })]);
    },
  };
}

function QueueList({ entries, activeId }: { entries: QueueEntry[]; activeId: string | null }) {
  return (
    <ul className="wd-qlist">
      {entries.map((e) => (
        <li key={e.id}>
          <Link
            href={`/work/jobs/${e.id}`}
            className="wd-qitem"
            aria-current={activeId === e.id ? "page" : undefined}
          >
            <span className={`wd-qdot ${e.tone}`} aria-hidden="true" />
            <span style={{ minWidth: 0 }}>
              <span className="wd-qtitle" style={{ display: "block" }}>
                {e.title}
              </span>
              <span className="wd-qsub">{e.line}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const activeId = pathname.match(/^\/work\/jobs\/([^/]+)/)?.[1] ?? null;
  const { user } = useAuth();
  const { queue, loading, error } = useWorkQueue();

  return (
    <aside className="wd-side" aria-label="Your work">
      <Link href="/work" className="wd-brand">
        <TigerMark />
        <span>
          TigerHire
          <br />
          <small>{user?.organisationName ?? "Your work"}</small>
        </span>
      </Link>

      <section>
        <div className="wd-qhead">
          <span>Needs you</span>
          <span>{loading ? "" : queue.needsYou.length}</span>
        </div>
        {loading ? (
          <p className="wd-qsub" style={{ padding: "8px 6px" }}>
            Loading your work…
          </p>
        ) : error ? (
          <p className="wd-qsub" role="alert" style={{ padding: "8px 6px" }}>
            Could not load your jobs. Reload to try again.
          </p>
        ) : queue.needsYou.length ? (
          <QueueList entries={queue.needsYou} activeId={activeId} />
        ) : (
          <p className="wd-qsub" style={{ padding: "8px 6px" }}>
            Nothing is waiting on you.
          </p>
        )}
      </section>

      {queue.moving.length > 0 && (
        <section>
          <div className="wd-qhead">
            <span>In motion</span>
            <span>{queue.moving.length}</span>
          </div>
          <QueueList entries={queue.moving} activeId={activeId} />
        </section>
      )}

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        <Link href="/recruit/hiring-requests" className="wd-btn">
          Start a new job
        </Link>
        <Link href="/recruit/jobs" className="wd-btn quiet">
          Open the classic view
        </Link>
      </div>
    </aside>
  );
}

/**
 * The work-driven shell: your queue on the left, the work item on the right.
 * No menus — the work decides which screen you see.
 */
export function WorkShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const rule = resolveDashboardRouteAccessRule(pathname);
  const allowed = !!user && (!rule || rule.roles.includes(user.role));

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (!allowed) router.replace(ROLE_DASHBOARD_PATH[user.role]);
  }, [loading, user, allowed, router]);

  return (
    <div className="wd">
      {!allowed ? (
        <p role="status" className="wd-muted" style={{ padding: 32 }}>
          Opening your work…
        </p>
      ) : (
        <div className="wd-shell">
          <Sidebar />
          <main className="wd-main" id="main">
            {children}
          </main>
        </div>
      )}
    </div>
  );
}
